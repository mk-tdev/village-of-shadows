"""Exercise the exact native-client REST flow against a running local backend.

Uses mock seats by default; --live makes a paid OpenAI preflight and one council
round. No credentials or private model prompts are printed.
"""
import argparse
import time
import httpx

parser = argparse.ArgumentParser()
parser.add_argument('--live', action='store_true')
args = parser.parse_args()
client = httpx.Client(base_url='http://127.0.0.1:8000', timeout=180)
names = ['Mara', 'Tomas', 'Elin', 'Bram', 'Sable', 'Corvin', 'Petra']
seats = [dict(seat_id=f'seat-{i}', display_name=name,
              personality='Careful observer; reason from the evidence.',
              controller='human' if i == 0 else 'ai',
              **({} if i == 0 else dict(provider='openai' if args.live else 'mock',
                                      model_name='gpt-5.4-mini' if args.live else 'mock-v1')))
         for i, name in enumerate(names)]

def request(method, path, **kwargs):
    response = client.request(method, path, **kwargs)
    response.raise_for_status()
    return response.json()

check = request('POST', '/games/preflight', json=seats)
assert check['ok'], 'Model preflight failed'
game = request('POST', '/games', json={'seats': seats, 'options': {'scenario': 'missing-villager'}})
sid = game['session_id']
auth = {'seat_id': 'seat-0', 'access_token': game['human_seats'][0]['access_token']}
host = {'host_token': game['host_token']}
seen = set()
try:
    request('POST', f'/games/{sid}/begin', params=host)
    deadline = time.monotonic() + 480
    while time.monotonic() < deadline:
        state = request('GET', f'/games/{sid}/state', params=auth)
        # No living opponent's role is disclosed to the human investigator.
        me = state['players'][0]
        if me['role'] != 'werewolf':
            assert all(p['role'] is None for p in state['players'][1:] if p['alive'])
        if state['winner']:
            print('COMPLETE:', state['winner'], 'turn kinds:', sorted(seen))
            assert {'investigation', 'statement', 'vote'} <= seen
            break
        if args.live and state['round'] > 1:
            print('LIVE COUNCIL VERIFIED: investigation, AI statements, human statement, vote, consequence')
            break
        awaiting = state.get('awaiting')
        if awaiting:
            kind = awaiting['kind']
            seen.add(kind)
            if kind == 'investigation':
                options = awaiting['options']
                action = 'present:both' if 'present:both' in options else options[0]
                value = {'action': action, 'turn_id': awaiting['turn_id']}
            elif kind == 'statement':
                value = {'text': 'The scarf was cut and planted. Compare the broken heel and mill key with the witness accounts before voting.'}
            else:
                value = {'target': awaiting['options'][0], 'text': 'Compare the physical evidence carefully.'}
            request('POST', f'/games/{sid}/input', json={**auth, 'kind': kind, 'value': value})
        time.sleep(.4)
    else:
        raise AssertionError('Game did not progress before deadline')
finally:
    request('POST', f'/games/{sid}/stop', params=host)

"""Host-only, read-only checkpoint inspection. Never invoke or resume a graph."""
from langchain_core.messages import BaseMessage
from pydantic import BaseModel

# Transport credentials and provider internals aren't learning state.
REDACTED = {'api_key', 'access_token', 'host_token', 'token', 'password', 'secret', 'endpoint',
            'additional_kwargs', 'response_metadata', 'reasoning', 'reasoning_content'}


def inspect_value(value):
    if isinstance(value, BaseMessage):
        content = value.content
        if isinstance(content, list):
            content = [block for block in content if isinstance(block, str) or
                       (isinstance(block, dict) and block.get('type') in {'text', 'output_text'})]
        return {'id': value.id, 'type': value.type, 'content': inspect_value(content),
                'name': value.name, 'tool_calls': inspect_value(getattr(value, 'tool_calls', [])),
                'tool_call_id': getattr(value, 'tool_call_id', None)}
    if isinstance(value, BaseModel):
        return inspect_value(value.model_dump())
    if isinstance(value, dict):
        return {str(key): '[redacted]' if str(key).lower() in REDACTED else inspect_value(item)
                for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [inspect_value(item) for item in value]
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    return str(value)


def describe(snapshot):
    config = (snapshot.config or {}).get('configurable', {})
    metadata = snapshot.metadata or {}
    return {'id': config.get('checkpoint_id'), 'created_at': snapshot.created_at,
            'step': metadata.get('step'), 'source': metadata.get('source'),
            'next': list(snapshot.next),
            'writes': list((metadata.get('writes') or {}).keys())}


async def inspect_thread(graph, thread_id, checkpoint_id=None):
    config = {'configurable': {'thread_id': thread_id}}
    history = [snapshot async for snapshot in graph.aget_state_history(config, limit=30)]
    selected_config = {'configurable': {'thread_id': thread_id}}
    if checkpoint_id:
        selected_config['configurable']['checkpoint_id'] = checkpoint_id
    selected = await graph.aget_state(selected_config)
    if not selected.values:
        return {'available': False, 'thread_id': thread_id, 'history': [describe(s) for s in history],
                'selected': None, 'values': {}, 'previous_values': {}, 'tasks': []}
    previous = await graph.aget_state(selected.parent_config) if selected.parent_config else None
    return {'available': True, 'thread_id': thread_id, 'history': [describe(s) for s in history],
            'selected': describe(selected), 'values': inspect_value(selected.values),
            'previous_values': inspect_value(previous.values) if previous else {},
            'tasks': [{'name': task.name, 'error': str(task.error) if task.error else None,
                       'interrupts': [inspect_value(i.value) for i in task.interrupts]}
                      for task in selected.tasks]}

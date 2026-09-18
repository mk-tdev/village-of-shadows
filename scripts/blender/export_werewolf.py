"""Export the human-approved study, baking its body detail into a portable GLB."""
import bpy
import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/werewolf'
review = json.loads((OUT/'review/milestone-reviews.json').read_text())
if review['form']['status'] != 'approved':
    raise RuntimeError('Record explicit human Form approval before exporting.')
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'watchman-werewolf.blend'))
rig = bpy.data.objects['Watchman_Werewolf_Rig']
rig.animation_data.action = None
# Feeding needs its own authored pose rather than overwriting glTF rest rotations.
if 'Feeding' not in bpy.data.actions:
    for frame, jaw in [(1,.3),(13,.65),(25,.3)]:
        values = {'Spine':(.8,0,0),'Chest':(.2,0,0),'Head':(.24,0,0),'Jaw':(jaw,0,0),
                  'ThighL':(-.7,0,0),'ThighR':(-.7,0,0),'ShinL':(.9,0,0),'ShinR':(.9,0,0),
                  'ArmL':(-.65,0,-.12),'ArmR':(-.65,0,.12)}
        for bone in rig.pose.bones:
            bone.rotation_euler = values.get(bone.name,(0,0,0))
            bone.keyframe_insert(data_path='rotation_euler',frame=frame,group=bone.name)
    clip = rig.animation_data.action
    clip.name = 'Feeding'; clip.use_fake_user = True
    track = rig.animation_data.nla_tracks.new(); track.name = clip.name
    track.strips.new(clip.name,1,clip); track.mute = True
rig.animation_data.action = None
for bone in rig.pose.bones: bone.rotation_euler = (0,0,0)
bpy.context.scene.frame_set(1)
body = bpy.data.objects['ContinuousAnatomy']
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); bpy.context.view_layer.objects.active = body
# Applying only non-skin modifiers preserves animation and exports the reviewed silhouette.
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH' or obj.name.startswith('REVIEW'): continue
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        if mod.type != 'ARMATURE': bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.objects.active = body
if not body.data.uv_layers:
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.015)
    bpy.ops.object.mode_set(mode='OBJECT')
mat = body.data.materials[0]; nodes = mat.node_tree.nodes; links = mat.node_tree.links
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
if not any(n.name == 'Baked dermis normal' for n in nodes):
    image = bpy.data.images.new('Werewolf dermis normal',width=1024,height=1024)
    image.colorspace_settings.name = 'Non-Color'
    target = nodes.new('ShaderNodeTexImage'); target.name = 'Baked dermis normal'; target.image = image
    nodes.active = target
    bpy.context.scene.cycles.samples = 8
    bpy.context.scene.render.bake.margin = 8
    bpy.ops.object.bake(type='NORMAL')
    image.pack()
    normal = nodes.new('ShaderNodeNormalMap')
    links.new(target.outputs['Color'],normal.inputs['Color'])
    links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
# Fine fur detail is geometry in the browser; remove unsupported procedural bumps.
for material in bpy.data.materials:
    if material == mat or not material.use_nodes: continue
    for node in material.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            for link in list(node.inputs['Normal'].links): material.node_tree.links.remove(link)
rig['runtime_status'] = 'Form approved by user: proceed, 2026-09-17. Local runtime integration.'
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for obj in rig.children_recursive:
    if obj.type == 'MESH': obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'watchman-werewolf.blend'),compress=True)
path = ROOT/'frontend/public/exploration/werewolf-blender.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
    export_apply=False,export_cameras=False,export_lights=False)
report = json.loads((OUT/'authoring-report.json').read_text())
report.update(runtime_exported=True,form_approval='User: proceed (2026-09-17)',
    materials_need_baking_before_gltf=False,actions=sorted(a.name for a in bpy.data.actions),
    output_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),output_bytes=path.stat().st_size,
    portable_materials='1024px baked dermis normal; fur geometry and PBR roughness; other procedural bumps omitted')
(OUT/'authoring-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('EXPORT_COMPLETE',json.dumps(report))

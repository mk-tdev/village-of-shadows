"""Build an editable Blender creature study from the project's original GLB.
Run: blender --background --factory-startup --python scripts/blender/author_werewolf.py
This creates review sources/renders only. Runtime export follows human Form review.
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/werewolf'
RENDERS = OUT / 'review/renders'
RENDERS.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'frontend/public/exploration/werewolf.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
rig.name = 'Watchman_Werewolf_Rig'
rig.show_in_front = True
rig['source'] = 'Original Village of Shadows procedural creature; Blender refinement study'
rig['runtime_status'] = 'Review only. No approved GLB export.'
body = bpy.data.objects['ContinuousAnatomy']
fur = bpy.data.objects['GroomedFur']
for obj in (body, fur):
    for poly in obj.data.polygons:
        poly.use_smooth = True
# The source GLB uses separate vertices per triangle. Weld before smoothing;
# smoothing disconnected triangles would shrink every face and perforate the skin.
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.00001)
bpy.ops.object.mode_set(mode='OBJECT')
# Recess the eye sockets so the eyeballs are not buried in the broad source brow.
for name in ('Mesh_15', 'Mesh_23'):
    eye = bpy.data.objects.get(name)
    if not eye:
        continue
    center = sum((eye.matrix_world @ v.co for v in eye.data.vertices), Vector()) / len(eye.data.vertices)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=.073, location=center)
    cutter = bpy.context.object
    boolean = body.modifiers.new('Recessed eye socket', 'BOOLEAN')
    boolean.operation = 'DIFFERENCE'; boolean.object = cutter
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=boolean.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
# Round the thin source ear silhouettes into supported volumes.
for obj in (bpy.data.objects.get('Mesh_16'), bpy.data.objects.get('Mesh_24')):
    if obj:
        solid = obj.modifiers.new('Ear thickness', 'SOLIDIFY'); solid.thickness = .018
        bevel = obj.modifiers.new('Rounded cartilage edge', 'BEVEL'); bevel.width = .012; bevel.segments = 3
# Preserve the imported weights and joint names. Smooth only the continuous body.
smooth = body.modifiers.new('Anatomical surface relaxation', 'SMOOTH')
smooth.factor = .35
smooth.iterations = 4

# Real roughness variation rather than shiny, uniformly plastic skin.
for index, material in enumerate(bpy.data.materials):
    if not material.use_nodes:
        continue
    bsdf = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        continue
    nodes, links = material.node_tree.nodes, material.node_tree.links
    noise = nodes.new('ShaderNodeTexNoise')
    noise.name = 'Fine surface breakup'
    noise.inputs['Scale'].default_value = 140 if material in body.data.materials[:] else 65
    noise.inputs['Detail'].default_value = 3
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .19
    bump.inputs['Distance'].default_value = .008
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    if material in fur.data.materials[:]:
        material.name = 'Charcoal guard hairs'
        for link in list(bsdf.inputs['Base Color'].links): links.remove(link)
        bsdf.inputs['Base Color'].default_value = (.028,.022,.018,1)
        bsdf.inputs['Roughness'].default_value = .88
    elif material in body.data.materials[:]:
        material.name = 'Weathered dermis beneath the coat'
        for link in list(bsdf.inputs['Base Color'].links): links.remove(link)
        bsdf.inputs['Base Color'].default_value = (.022,.017,.015,1)
        bsdf.inputs['Roughness'].default_value = .73

# Poses use local rig channels; NLA strips keep every action editable in Blender.
# No generated clips are silently substituted for Three.js's existing pose code.
for bone in rig.pose.bones:
    bone.rotation_mode = 'XYZ'

def pose(frame, values):
    for bone in rig.pose.bones:
        bone.rotation_euler = values.get(bone.name, (0, 0, 0))
        bone.keyframe_insert(data_path='rotation_euler', frame=frame, group=bone.name)

def action(name, frames):
    rig.animation_data_create()
    rig.animation_data.action = None
    for frame, values in frames:
        pose(frame, values)
    clip = rig.animation_data.action
    clip.name = name
    clip.use_fake_user = True
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, clip)
    track.mute = True
    rig.animation_data.action = None
    return clip

idle = action('Threat_Idle', [(1, {'Neck':(-.08,0,0)}), (31, {'Spine':(.035,0,0),'Neck':(-.1,0,0),'Jaw':(.12,0,0)}), (61, {'Neck':(-.08,0,0)})])
roar = action('Threat_Roar', [(1, {}), (12, {'Spine':(.12,0,0),'Head':(-.22,0,0),'Jaw':(.55,0,0)}), (27, {'Spine':(.08,0,0),'Head':(-.17,0,0),'Jaw':(.48,0,0)}), (40, {})])
transform = action('Transformation_Convulsion', [(1, {'Spine':(.45,0,0),'Head':(.18,0,0)}), (18, {'Spine':(.2,0,.06),'Head':(-.2,0,-.08),'Jaw':(.25,0,0)}), (36, {'Spine':(.12,0,-.04),'Head':(-.3,0,.1),'Jaw':(.5,0,0)}), (64, {})])
lunge = action('Attack_Lunge', [(1, {}), (9, {'Spine':(.3,0,0),'ThighL':(-.4,0,0),'ThighR':(-.4,0,0)}), (18, {'Spine':(.55,0,0),'Head':(-.35,0,0),'Jaw':(.6,0,0),'ArmL':(-.9,0,-.15),'ArmR':(-.9,0,.15)}), (30, {})])
walk = action('Hunt_Stride', [(f, {'ThighL':(s*.3,0,0),'ThighR':(-s*.3,0,0),'ArmL':(-s*.15,0,0),'ArmR':(s*.15,0,0),'ShinL':(max(0,-s)*.35,0,0),'ShinR':(max(0,s)*.35,0,0)}) for f,s in [(1,0),(7,1),(13,0),(19,-1),(25,0)]])

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 1000
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.render.fps = 24
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.025,.035,.05,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .22
scene.view_settings.view_transform = 'AgX'
# A neutral review stage, distinct from the unchanged production village.
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = 'REVIEW_ONLY_Ground'
mat = bpy.data.materials.new('Review slate'); mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.028,.033,.04,1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9
floor.data.materials.append(mat)

def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def light(name, location, energy, color, size):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.color=color; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=location;aim(obj,(0,0,1.5))
light('REVIEW_Key', (3,-4,5), 850, (1,.77,.55), 4)
light('REVIEW_Rim', (-3,2,4), 1150, (.48,.65,1), 3)
light('REVIEW_Fill', (-2,-4,2), 300, (.65,.75,1), 3)
data=bpy.data.cameras.new('REVIEW_Camera');camera=bpy.data.objects.new('REVIEW_Camera',data);scene.collection.objects.link(camera);scene.camera=camera
camera.data.lens=60
rig.animation_data.action=idle
scene.frame_start=1;scene.frame_end=61;scene.frame_set(1)
# Store provenance and measured authored geometry, never fabricated gate approvals.
report={'blender':bpy.app.version_string,'input_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'bones':list(rig.pose.bones.keys()),'actions':[a.name for a in bpy.data.actions], 'source_mesh_triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH' and o != floor),'runtime_exported':False,'form_approval':'pending','materials_need_baking_before_gltf':True}
(OUT/'authoring-report.json').write_text(json.dumps(report,indent=2)+'\n')
views=[('three-quarter',(4,-7,3),(0,0,1.4),idle,1),('front',(0,-8,2.8),(0,0,1.4),idle,1),('profile',(7,0,2.8),(0,0,1.4),idle,1),('roar-detail',(1.5,-3.2,3.0),(0,-.2,2.25),roar,18)]
for name,location,target,clip,frame in views:
    rig.animation_data.action=clip;scene.frame_set(frame)
    camera.location=location;aim(camera,target)
    scene.render.filepath=str(RENDERS/(name+'.png'))
    bpy.ops.render.render(write_still=True)
rig.animation_data.action=idle;scene.frame_start=1;scene.frame_end=61;scene.frame_set(1)
camera.location=(4,-7,3);aim(camera,(0,0,1.4))
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'watchman-werewolf.blend'), compress=True)
print('AUTHORING_COMPLETE',json.dumps(report))

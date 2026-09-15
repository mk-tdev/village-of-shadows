"""Run inside Unreal Editor with -run=pythonscript -script=..."""
import unreal
from pathlib import Path

repo = Path(unreal.Paths.project_dir()).resolve().parents[1]
tools = unreal.AssetToolsHelpers.get_asset_tools()
unreal.AssetRegistryHelpers.get_asset_registry().search_all_assets(synchronous_search=True)
for name in ["island_tree_01", "fern_02", "boulder_01", "gothic_statue"]:
    dest = f"/Game/Forest/{name}"
    if not unreal.EditorAssetLibrary.does_directory_exist(dest):
        task = unreal.AssetImportTask()
        task.filename = str(repo / "unreal" / "SourceAssets" / name / f"{name}_1k.gltf")
        task.destination_path = dest
        task.automated = True
        task.save = True
        task.replace_existing = False
        tools.import_asset_tasks([task])
    for asset_path in unreal.EditorAssetLibrary.list_assets(dest, recursive=True):
        obj = unreal.EditorAssetLibrary.load_asset(asset_path)
        usage = next(getattr(unreal.MaterialUsage, key) for key in dir(unreal.MaterialUsage) if "INSTANCED_STATIC_MESHES" in key)
        if isinstance(obj, unreal.Material):
            unreal.MaterialEditingLibrary.set_material_usage(obj, usage)
            unreal.MaterialEditingLibrary.recompile_material(obj)
            unreal.EditorAssetLibrary.save_loaded_asset(obj)
        elif isinstance(obj, unreal.MaterialInstanceConstant):
            unreal.MaterialEditingLibrary.set_material_usage_override(obj, usage, True, True)
            unreal.MaterialEditingLibrary.update_material_instance(obj)
            unreal.EditorAssetLibrary.save_loaded_asset(obj)
        if isinstance(obj, unreal.StaticMesh):
            unreal.log(f"FOREST_MESH {obj.get_path_name()} bounds={obj.get_bounds().box_extent}")

# PBR color textures already authored for the browser prologue.
for name in ["weathered-timber", "wet-cobblestone"]:
    task=unreal.AssetImportTask()
    task.filename=str(repo / "frontend" / "public" / "exploration" / f"{name}.png")
    task.destination_path="/Game/Forest/Textures"
    task.destination_name=name.replace("-","_")
    task.automated=True
    task.save=True
    task.replace_existing=True
    tools.import_asset_tasks([task])

def material(name, color, texture=None, emissive=0, ghost=False):
    if unreal.EditorAssetLibrary.does_asset_exist("/Game/Forest/Materials/"+name):
        return
    m=tools.create_asset(name,"/Game/Forest/Materials",unreal.Material,unreal.MaterialFactoryNew())
    m.set_editor_property("two_sided",True)
    if ghost:
        m.set_editor_property("blend_mode",unreal.BlendMode.BLEND_TRANSLUCENT)
    c=unreal.MaterialEditingLibrary.create_material_expression(m,unreal.MaterialExpressionConstant3Vector)
    c.set_editor_property("constant",unreal.LinearColor(*color))
    unreal.MaterialEditingLibrary.connect_material_property(c,"",unreal.MaterialProperty.MP_BASE_COLOR)
    if texture:
        t=unreal.MaterialEditingLibrary.create_material_expression(m,unreal.MaterialExpressionTextureSample)
        t.set_editor_property("texture",unreal.EditorAssetLibrary.load_asset(texture))
        uv=unreal.MaterialEditingLibrary.create_material_expression(m,unreal.MaterialExpressionTextureCoordinate)
        uv.set_editor_property("u_tiling",1 if ghost else 3)
        uv.set_editor_property("v_tiling",1 if ghost else 3)
        unreal.MaterialEditingLibrary.connect_material_expressions(uv,"",t,"UVs")
        unreal.MaterialEditingLibrary.connect_material_property(t,"RGB",unreal.MaterialProperty.MP_BASE_COLOR)
    if emissive:
        e=unreal.MaterialEditingLibrary.create_material_expression(m,unreal.MaterialExpressionConstant3Vector)
        e.set_editor_property("constant",unreal.LinearColor(color[0]*emissive,color[1]*emissive,color[2]*emissive,1))
        unreal.MaterialEditingLibrary.connect_material_property(e,"",unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    rough=unreal.MaterialEditingLibrary.create_material_expression(m,unreal.MaterialExpressionConstant)
    rough.set_editor_property("r",.8)
    unreal.MaterialEditingLibrary.connect_material_property(rough,"",unreal.MaterialProperty.MP_ROUGHNESS)
    if ghost:
        opacity=unreal.MaterialEditingLibrary.create_material_expression(m,unreal.MaterialExpressionConstant)
        opacity.set_editor_property("r",.72)
        unreal.MaterialEditingLibrary.connect_material_property(opacity,"",unreal.MaterialProperty.MP_OPACITY)
    unreal.MaterialEditingLibrary.recompile_material(m)
    unreal.EditorAssetLibrary.save_loaded_asset(m)

material("Timber",(.14,.10,.065,1),"/Game/Forest/Textures/weathered_timber")
material("Path",(.1,.12,.1,1),"/Game/Forest/Textures/wet_cobblestone")
material("Earth",(.025,.038,.022,1))
material("Roof",(.04,.055,.045,1))
material("Ghost",(.2,.48,.42,1),emissive=.65,ghost=True)
material("GhostVeil",(.12,.3,.25,1),"/Game/Forest/gothic_statue/gothic_statue_1k/Textures/gothic_statue_diff",emissive=.4,ghost=True)
material("Flame",(1,.28,.025,1),emissive=8)
material("Seal",(.2,.8,.65,1),emissive=3)
unreal.EditorAssetLibrary.save_directory("/Game/Forest",only_if_is_dirty=True,recursive=True)
unreal.log("FOREST_IMPORT_COMPLETE")

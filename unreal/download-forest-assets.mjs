import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const root = path.resolve("unreal/SourceAssets");
for (const id of ["island_tree_01", "fern_02", "boulder_01", "gothic_statue"]) {
  const manifest = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const file = manifest.gltf["1k"].gltf;
  const dir = path.join(root,id);
  const records = {[`${id}_1k.gltf`]:file,...file.include};
  for (const [name, info] of Object.entries(records)) {
    const target = path.join(dir,name);
    await fs.mkdir(path.dirname(target),{recursive:true});
    try { const old=await fs.readFile(target); if(crypto.createHash("md5").update(old).digest("hex")===info.md5) continue; } catch {}
    const response = await fetch(info.url);
    if(!response.ok) throw Error(`${info.url}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if(crypto.createHash("md5").update(bytes).digest("hex")!==info.md5) throw Error(`Checksum mismatch: ${name}`);
    await fs.writeFile(target,bytes);
  }
  await fs.writeFile(path.join(dir,"provenance.json"),JSON.stringify({source:`https://polyhaven.com/a/${id}`,license:"CC0",manifest:file},null,2));
  console.log(`Downloaded and verified ${id}`);
}

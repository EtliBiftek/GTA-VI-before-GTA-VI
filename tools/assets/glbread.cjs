// minimal GLB reader -> flat triangle soup in world (root) space
const fs=require('fs');
function quatMat(q,t,s){const [x,y,z,w]=q;const m=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w),0, 2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w),0, 2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y),0, 0,0,0,1];
 // column-major, apply scale
 for(let c=0;c<3;c++)for(let r=0;r<3;r++)m[c*4+r]*=s[c]; m[12]=t[0];m[13]=t[1];m[14]=t[2];return m;}
function mul(a,b){const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function nodeMat(n){if(n.matrix)return n.matrix.slice();return quatMat(n.rotation||[0,0,0,1],n.translation||[0,0,0],n.scale||[1,1,1]);}
function readGLB(file){
  const b=fs.readFileSync(file);const jl=b.readUInt32LE(12);const j=JSON.parse(b.slice(20,20+jl).toString());
  const bin=b.slice(20+jl+8);
  const comp={5120:[1,Int8Array],5121:[1,Uint8Array],5122:[2,Int16Array],5123:[2,Uint16Array],5125:[4,Uint32Array],5126:[4,Float32Array]};
  const nc={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
  function acc(i){const a=j.accessors[i];const bv=j.bufferViews[a.bufferView];const [sz,T]=comp[a.componentType];const n=nc[a.type];
    const stride=bv.byteStride||sz*n;const off=(bv.byteOffset||0)+(a.byteOffset||0);const out=new (T===Uint32Array?Uint32Array:T===Float32Array?Float32Array:T)(a.count*n);
    const dv=new DataView(bin.buffer,bin.byteOffset);
    for(let e=0;e<a.count;e++)for(let k=0;k<n;k++){const p=off+e*stride+k*sz;out[e*n+k]=T===Float32Array?dv.getFloat32(p,true):T===Uint16Array?dv.getUint16(p,true):T===Uint32Array?dv.getUint32(p,true):T===Uint8Array?dv.getUint8(p):T===Int8Array?dv.getInt8(p):dv.getInt16(p,true);}
    return out;}
  const prims=[];
  function walk(i,pm,path){const n=j.nodes[i];const m=mul(pm,nodeMat(n));const p=path+'/'+n.name;
    if(n.mesh!=null){for(const pr of j.meshes[n.mesh].primitives){
      const pos=acc(pr.attributes.POSITION),nor=pr.attributes.NORMAL!=null?acc(pr.attributes.NORMAL):null,uv=pr.attributes.TEXCOORD_0!=null?acc(pr.attributes.TEXCOORD_0):null;
      const idx=pr.indices!=null?acc(pr.indices):Array.from({length:pos.length/3},(_,k)=>k);
      const P=new Float32Array(pos.length),N=nor?new Float32Array(nor.length):null;
      for(let v=0;v<pos.length/3;v++){const x=pos[v*3],y=pos[v*3+1],z=pos[v*3+2];
        P[v*3]=m[0]*x+m[4]*y+m[8]*z+m[12];P[v*3+1]=m[1]*x+m[5]*y+m[9]*z+m[13];P[v*3+2]=m[2]*x+m[6]*y+m[10]*z+m[14];
        if(N){const a=nor[v*3],c=nor[v*3+1],d=nor[v*3+2];N[v*3]=m[0]*a+m[4]*c+m[8]*d;N[v*3+1]=m[1]*a+m[5]*c+m[9]*d;N[v*3+2]=m[2]*a+m[6]*c+m[10]*d;}}
      prims.push({name:n.name,path:p,pos:P,nor:N,uv,idx,material:pr.material!=null?j.materials[pr.material]:null});}}
    (n.children||[]).forEach(c=>walk(c,m,p));}
  const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  j.scenes[0].nodes.forEach(i=>walk(i,I,''));
  // embedded image bytes per material (base colour texture), if any
  const imageOf=(m)=>{const t=m&&m.pbrMetallicRoughness&&m.pbrMetallicRoughness.baseColorTexture;if(!t)return null;const im=j.images&&j.images[j.textures[t.index].source];if(!im)return null;
    if(im.bufferView!=null){const bv=j.bufferViews[im.bufferView];return {name:im.name||im.uri||'embedded',bytes:bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength)};}
    return {name:im.uri,uri:im.uri};};
  for(const pr of prims)pr.image=imageOf(pr.material);
  return {json:j,prims};
}
module.exports={readGLB};

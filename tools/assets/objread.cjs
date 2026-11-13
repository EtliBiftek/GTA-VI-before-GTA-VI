const fs=require('fs');
function readOBJ(file){
  const lines=fs.readFileSync(file,'utf8').split('\n');const V=[],N=[],T=[];const groups=[];let cur=null,obj='',mat='';
  for(const l of lines){const p=l.trim().split(/\s+/);
    if(p[0]==='v')V.push([+p[1],+p[2],+p[3]]);else if(p[0]==='vn')N.push([+p[1],+p[2],+p[3]]);else if(p[0]==='vt')T.push([+p[1],+p[2]]);
    else if(p[0]==='o'||p[0]==='g'){obj=p[1];}else if(p[0]==='usemtl'){mat=p[1];cur=null;}
    else if(p[0]==='f'){ if(!cur){cur={obj,mat,tris:[]};groups.push(cur);} const vs=p.slice(1).map(s=>{const a=s.split('/');return {v:+a[0]-1,n:a[2]?+a[2]-1:-1};});
      for(let i=1;i<vs.length-1;i++)cur.tris.push([vs[0],vs[i],vs[i+1]]);}}
  return {V,N,groups};
}
module.exports={readOBJ};

import {
  brasiliaLayout,
  isClearedPoint,
  isClearedCollider,
  shouldClearBuilding,
  collisionLandmarks,
} from '../src/brasilia-layout.js';

/** Geometria procedural inserida antes dos patches do cliente. */
export function brasiliaSceneRuntimeSource() {
  return `
const __brasiliaLayout = ${JSON.stringify(brasiliaLayout)};
const __brasiliaRemoved = new Set(__brasiliaLayout.removedBuildings.map(b => b.id));
const __brasiliaShouldClearBuilding = ${shouldClearBuilding.toString()};
const __brasiliaCollisionLandmarks = (${collisionLandmarks.toString()})(__brasiliaLayout);
const __brasiliaGroundSolids = __brasiliaCollisionLandmarks.flatMap(p=>p.solids.map(s=>({x:p.x+s.x,z:p.z+s.z,w:s.w,d:s.d,height:s.h??p.h,kind:"building",brasilia:true})));
const __brasiliaSolids = __brasiliaCollisionLandmarks.flatMap(p=>(p.airSolids??p.solids).map(s=>({
  x:p.x+s.x,z:p.z+s.z,w:s.w,d:s.d,bottom:s.y??0,height:(s.y??0)+(s.h??p.h),kind:"building",brasilia:true
})));
const __brasiliaIsClearedPoint = ${isClearedPoint.toString()};
const __brasiliaIsClearedCollider = ${isClearedCollider.toString()};
function __brasiliaClearPoint(x,z) {
  return __brasiliaIsClearedPoint(x,z,__brasiliaLayout);
}
function __brasiliaInPlot(x,z) {
  return __brasiliaLayout.clearedPlots.some(p=>Math.abs(x-p.x)<p.w/2 && Math.abs(z-p.z)<p.d/2);
}
function __brasiliaKeepTree(x,z) {
  return !__brasiliaClearPoint(x,z) && !(x>55 && z>-145 && z<10 && ((Math.floor(x/8)+Math.floor(z/8))%4+4)%4!==0);
}
function __brasiliaMapLandmarks(context, rect) {
  for(const p of __brasiliaCollisionLandmarks) {
    context.fillStyle=p.kind==='ministry'?'#d7dfd2':'#eeeade';
    rect(p.x-p.w/2,p.z-p.d/2,p.x+p.w/2,p.z+p.d/2);
    if(p.kind==='congress') {
      context.fillStyle='#426873';
      for(const dx of [-10,10]) rect(p.x+dx-4.5,p.z-19,p.x+dx+4.5,p.z-5);
    } else if(p.kind==='tower') {
      context.fillStyle='#426873';
      rect(p.x-3,p.z-3,p.x+3,p.z+3);
    }
  }
}
function __brasiliaGardens(builder) {
  const lawn=new On(), y=Mn+0.012;
  for(const p of __brasiliaLayout.clearedPlots) {
    const x0=p.x-p.w/2,x1=p.x+p.w/2,z0=p.z-p.d/2,z1=p.z+p.d/2;
    lawn.quad({x:x0,y,z:z1},{x:x1,y,z:z1},{x:x1,y,z:z0},{x:x0,y,z:z0},[x0/6,z1/6,x1/6,z1/6,x1/6,z0/6,x0/6,z0/6]);
  }
  const material=HU(), originalCompile=material.onBeforeCompile;
  material.onBeforeCompile=(shader)=>{
    originalCompile(shader);
    shader.fragmentShader=shader.fragmentShader.replace(
      'streets(vWorld.xz); if(min(min(gStreetX,gStreetZ),gRibbon)<0.1) discard;',
      'streets(vWorld.xz); if(min(min(gStreetX,gStreetZ),gRibbon)<4.0 || abs(vWorld.x)<34.5) discard;');
  };
  material.customProgramCacheKey=()=>"brasilia-gardens-v1";
  const mesh=new ge(lawn.build(),material); mesh.name="brasilia-gramados"; mesh.receiveShadow=true;
  builder.group.add(mesh);
}
function __brasiliaScene(builder) {
  __brasiliaGardens(builder);
  const white=new On(), glass=new On(), dark=new On();
  const box=(b,x,y,z,w,h,d)=>b.box(x,Mn+y,z,w,h,d);
  const beam=(b,a,c,w)=>b.beam({x:a[0],y:Mn+a[1],z:a[2]},{x:c[0],y:Mn+c[1],z:c[2]},w);
  for(const p of __brasiliaLayout.landmarks) {
    if((__brasiliaLayout.models??[]).some(m=>m.fallbackId===p.id)) continue;
    if(p.kind==='ministry') {
      box(glass,p.x,p.h/2,p.z,p.w,p.h,p.d);
      box(white,p.x,p.h+0.4,p.z,p.w+1.6,0.8,p.d+1.6);
      for(let y=0.4;y<p.h;y+=3.5) box(white,p.x,y,p.z,p.w+0.8,0.5,p.d+0.8);
      for(let x=-p.w/2;x<=p.w/2;x+=5.65) {
        box(white,p.x+x,p.h/2,p.z-p.d/2-0.15,0.42,p.h,0.5);
        box(white,p.x+x,p.h/2,p.z+p.d/2+0.15,0.42,p.h,0.5);
      }
    } else if(p.kind==='tower') {
      box(white,p.x,5,p.z,12,10,12);
      const first=builder.group.children.length;
      builder.antenna(p.x,p.z,Mn);
      const factor=p.h/121;
      for(const object of builder.group.children.slice(first)) {
        if(object.geometry && object.position.y===0) { object.scale.y=factor; object.position.y=Mn*(1-factor); }
        else object.position.y=Mn+(object.position.y-Mn)*factor;
      }
      box(white,p.x,37,p.z,18,2,18);
      box(glass,p.x,39,p.z,16,2,16);
      box(white,p.x,40.4,p.z,18,0.8,18);
    } else if(p.kind==='cathedral') {
      // Plinto conserva o footprint sólido; o vidro acompanha a silhueta radial.
      box(white,p.x,0.5,p.z,34,1,34);
      for(let face=0;face<16;face++) {
        const a=face*Math.PI*2/16, b=(face+1)*Math.PI*2/16;
        const point=(angle,radius,height)=>({x:p.x+Math.cos(angle)*radius,y:Mn+height,z:p.z+Math.sin(angle)*radius});
        glass.quad(point(b,17,1),point(a,17,1),point(a,9,17),point(b,9,17),[0,0,1,0,1,1,0,1]);
      }
      for(let rib=0;rib<16;rib++) {
        const angle=rib*Math.PI*2/16, cx=Math.cos(angle), sz=Math.sin(angle);
        const nodes=[[20,0],[15,8],[9,17],[10,24],[14,31]];
        for(let k=1;k<nodes.length;k++) beam(white,
          [p.x+cx*nodes[k-1][0],nodes[k-1][1],p.z+sz*nodes[k-1][0]],
          [p.x+cx*nodes[k][0],nodes[k][1],p.z+sz*nodes[k][0]],1.1);
      }
    } else if(p.kind==='congress') {
      box(white,p.x,1.5,p.z,p.w,3,p.d);
      for(const dx of [-10,10]) {
        box(glass,p.x+dx,34,p.z-12,9,62,14);
        for(const edge of [-4.5,4.5]) box(white,p.x+dx+edge,34,p.z-12,0.7,62,14.6);
        box(white,p.x+dx,65.4,p.z-12,10,0.8,15);
      }
      for(const [dx,inverted] of [[-25,false],[25,true]]) {
        const dome=new ge(new Ia(14,32,12,0,Math.PI*2,0,Math.PI/2),new At({color:'#f2efe3',roughness:0.78,side:Ht}));
        dome.position.set(p.x+dx,Mn+(inverted?14.2:3),p.z+16);
        dome.scale.y=0.8;
        if(inverted) dome.rotation.z=Math.PI;
        dome.castShadow=dome.receiveShadow=true;
        dome.name=inverted?'brasilia-congresso-cupula-concava':'brasilia-congresso-cupula-convexa';
        builder.group.add(dome);
      }
    }
  }
  for(const [geometry,color,name] of [[white,'#eeeade','brasilia-concreto'],[glass,'#426873','brasilia-vidro'],[dark,'#353c3e','brasilia-metal']]) {
    if(!geometry.vertexCount) continue;
    const mesh=new ge(geometry.build(),new At({color,roughness:0.72,metalness:0.12}));
    mesh.name=name; mesh.castShadow=mesh.receiveShadow=true; builder.group.add(mesh);
  }
  const fallbacks = new Map();
  for(const p of __brasiliaLayout.models??[]) {
    const group=new ct(); group.name='brasilia-modelo-reserva-'+p.id;
    const blocks=new On();
    for(const solid of p.airSolids??p.solids) {
      const height=solid.h??p.h;
      blocks.box(p.x+solid.x,Mn+(solid.y??0)+height/2,p.z+solid.z,solid.w,height,solid.d);
    }
    const material=new At({color:'#e4e0d4',roughness:0.82});
    const mesh=new ge(blocks.build(),material); mesh.receiveShadow=true;
    group.add(mesh); builder.group.add(group); fallbacks.set(p.id,group);
  }
  __brasiliaStartModels(builder.group, fallbacks);
}
`;
}

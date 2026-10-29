import { createDracoLoaderClass } from './vendor/draco-loader-r180.js';

export function brasiliaTextureSize(width, height, maximum) {
  const scale = Math.min(1, maximum / width, maximum / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadBrasiliaModelRequest(entry, load, remove, cancellations, timeoutMs) {
  return new Promise((resolve, reject) => {
    const abort = new AbortController();
    let settled = false;
    const cancel = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cancellations.delete(cancel);
        abort.abort();
        reject(new Error('Carregamento cancelado'));
      }
    };
    const timer = setTimeout(cancel, timeoutMs);
    entry.cancel = cancel;
    cancellations.add(cancel);
    Promise.resolve()
      .then(() => load(entry.model, { signal: abort.signal }))
      .then(
        (object) => {
          if (settled) {
            remove(object);
            return;
          }
          settled = true;
          clearTimeout(timer);
          cancellations.delete(cancel);
          resolve(object);
        },
        (error) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            cancellations.delete(cancel);
            reject(error);
          }
        },
      );
  });
}

// Autocontido para incorporação no cliente e testes sem WebGL.
export function createBrasiliaModelController({
  models,
  load,
  install,
  remove,
  fallback,
  now = () => Date.now(),
  mobile = false,
  timeoutMs = 35000,
}) {
  const entries = models.map((model) => ({
    model,
    status: 'idle',
    attempts: 0,
    next: 0,
    object: null,
  }));
  const cache = new Map(),
    cancellations = new Set();
  let active = 0,
    disposed = false,
    position = null,
    wanted = new Set();
  const radius = mobile ? 180 : 350;
  const distance = (model) => Math.hypot(model.x - position.x, model.z - position.z);
  // Evita trocar modelos residentes por diferenças mínimas nas fronteiras.
  const retentionMargin = 20;
  const retained = (entry) => entry.status === 'ready' || entry.status === 'loading';
  const priority = (entry) => distance(entry.model) - (retained(entry) ? retentionMargin : 0);
  function pump() {
    if (disposed || !position) return;
    const nearest = entries
      .filter((e) => distance(e.model) <= radius + (retained(e) ? retentionMargin : 0))
      .sort((a, b) => priority(a) - priority(b));
    wanted = new Set(nearest.slice(0, mobile ? 2 : 5).map((e) => e.model.id));
    for (const entry of entries)
      if (entry.status === 'loading' && !wanted.has(entry.model.id)) {
        entry.obsolete = true;
        entry.cancel?.();
      }
    for (const entry of entries)
      if (entry.object && !wanted.has(entry.model.id)) {
        remove(entry.object);
        entry.object = null;
        entry.status = 'idle';
        entry.attempts = 0;
        cache.delete(entry.model.path);
        fallback(entry.model, true);
      }
    const pending = nearest.filter(
      (e) => wanted.has(e.model.id) && e.status === 'idle' && e.next <= now(),
    );
    for (const entry of pending) {
      if (active >= 2) break;
      active++;
      entry.status = 'loading';
      entry.obsolete = false;
      entry.attempts++;
      const key = entry.model.path;
      if (!cache.has(key))
        cache.set(key, loadBrasiliaModelRequest(entry, load, remove, cancellations, timeoutMs));
      cache
        .get(key)
        .then((object) => {
          if (disposed || !wanted.has(entry.model.id)) {
            remove(object);
            cache.delete(key);
            entry.status = 'idle';
            entry.attempts = 0;
            entry.next = 0;
            return;
          }
          try {
            install(object, entry.model);
          } catch (error) {
            remove(object);
            throw error;
          }
          entry.object = object;
          entry.status = 'ready';
          entry.attempts = 0;
          entry.next = 0;
          fallback(entry.model, false);
        })
        .catch(() => {
          cache.delete(key);
          entry.status = 'idle';
          if (entry.obsolete || !wanted.has(entry.model.id)) {
            entry.attempts = 0;
            entry.next = 0;
          } else
            entry.next = now() + Math.min(120000, 15000 * 2 ** Math.min(entry.attempts - 1, 3));
          if (!disposed) fallback(entry.model, true);
        })
        .finally(() => {
          entry.cancel = null;
          active--;
          pump();
        });
    }
  }
  return {
    update(x, z) {
      if (disposed || !Number.isFinite(x) || !Number.isFinite(z)) return;
      position = { x, z };
      for (const entry of entries)
        if (entry.object) {
          const modelDistance = distance(entry.model),
            shadowNear = modelDistance < 180;
          entry.object.visible = modelDistance <= radius + 140;
          if (entry.object.userData.shadowNear !== shadowNear) {
            entry.object.userData.shadowNear = shadowNear;
            entry.object.traverse((child) => {
              if (child.isMesh) child.castShadow = !mobile && entry.object.userData.shadowNear;
            });
          }
        }
      pump();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cancel of [...cancellations]) cancel();
      for (const entry of entries)
        if (entry.object) {
          remove(entry.object);
          entry.object = null;
          entry.status = 'idle';
        }
      cache.clear();
    },
    stats: () => ({
      active,
      ready: entries.filter((e) => e.status === 'ready').length,
      cached: cache.size,
      disposed,
      residentIds: entries.filter((e) => e.object).map((e) => e.model.id),
      failedCount: entries.filter((e) => e.status === 'idle' && e.attempts > 0).length,
      models: entries.map((e) => ({ id: e.model.id, status: e.status, attempts: e.attempts })),
    }),
  };
}

export function brasiliaModelRuntimeSource() {
  return `
const __brasiliaTextureSize = ${brasiliaTextureSize.toString()};
const loadBrasiliaModelRequest = ${loadBrasiliaModelRequest.toString()};
const __brasiliaCreateModelController = ${createBrasiliaModelController.toString()};
let __brasiliaModelController = null;
function __brasiliaDisposeObject(object) {
  if (!object) return;
  object.removeFromParent();
  const geometries = new Set(), materials = new Set(), textures = new Set();
  object.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(t => { t.source?.data?.close?.(); t.dispose(); });
  materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
}
function __brasiliaStartModels(parent, fallbacks) {
  const models = __brasiliaLayout.models ?? [];
  if (!models.length) return;
  const DRACOLoader = (${createDracoLoaderClass.toString()})({BufferAttribute:bn,BufferGeometry:Ft,Color:_e,ColorManagement:$t,FileLoader:Jy,Loader:bh,LinearSRGBColorSpace:ta,SRGBColorSpace:gt});
  const draco = new DRACOLoader().setDecoderPath('/assets/brasilia/draco-r180/').setWorkerLimit(2);
  const loader = new po().setMeshoptDecoder(ar).setDRACOLoader(draco);
  const mobile = matchMedia('(max-width: 800px)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const controller = __brasiliaCreateModelController({ models, mobile,
    load: async (model, {signal}) => {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
      const cancel = () => abort.abort();
      signal.addEventListener('abort', cancel, {once:true});
      if(signal.aborted) cancel();
      let buffer;
      try {
        const response=await fetch(model.path,{signal:abort.signal,credentials:'omit'});
        if(!response.ok) throw new Error('Modelo Brasília indisponível');
        buffer=await response.arrayBuffer();
      } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
      const result=await loader.parseAsync(buffer,model.path.slice(0,model.path.lastIndexOf('/')+1));
      const originals=new Map(), seen=new Set(), maxTexture=mobile?512:1024;
      result.scene.traverse(child => {
        for(const material of Array.isArray(child.material)?child.material:child.material?[child.material]:[]) {
          for(const texture of Object.values(material)) if(texture?.isTexture && !seen.has(texture)) {
            seen.add(texture); const image=texture.image;
            if(image?.width>maxTexture || image?.height>maxTexture) {
              if(!originals.has(image)) originals.set(image,[]);
              originals.get(image).push(texture);
            }
          }
        }
      });
      try {
        for(const [image,textures] of originals) {
          const size=__brasiliaTextureSize(image.width,image.height,maxTexture);
          let resized;
          if(typeof createImageBitmap==='function') resized=await createImageBitmap(image,{resizeWidth:size.width,resizeHeight:size.height,resizeQuality:'high',colorSpaceConversion:'none',premultiplyAlpha:'none'});
          else {
            resized=document.createElement('canvas'); resized.width=size.width; resized.height=size.height;
            const context=resized.getContext('2d'); if(!context) throw new Error('Textura indisponível');
            context.drawImage(image,0,0,size.width,size.height);
          }
          textures.forEach(texture => { texture.image=resized; texture.needsUpdate=true; });
          image.close?.();
        }
      } catch(error) { __brasiliaDisposeObject(result.scene); throw error; }
      return result.scene;
    },
    install: (object, model) => {
      const box = new Sn().setFromObject(object), size = box.getSize(new _()), center = box.getCenter(new _());
      const angle = model.rotation ?? 0, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
      const scale = Math.min(model.w / Math.max(0.001,size.x*c+size.z*s), model.d / Math.max(0.001,size.z*c+size.x*s), model.h / Math.max(0.001,size.y));
      if (!(scale > 0) || !Number.isFinite(scale)) throw new Error('Modelo Brasília inválido');
      const group = new ct(); group.name = 'brasilia-modelo-' + model.id;
      object.position.x -= center.x; object.position.z -= center.z; object.position.y -= box.min.y;
      group.add(object); group.scale.setScalar(scale); group.rotation.y = angle; group.position.set(model.x,Mn,model.z);
      group.traverse(child => {
        // Apenas sinalização explicitamente interna; fachadas e pisos ambíguos permanecem íntegros.
        if (/^Level_\\d+_sign$|^Reception building identity$/.test(child.name)) child.visible=false;
        if(child.isMesh) { child.receiveShadow=true; child.castShadow=!mobile; child.frustumCulled=true; }
      });
      // O controller mantém o grupo transformado, sem alterar o grafo importado.
      object.userData.brasiliaContainer = group;
      parent.add(group);
    },
    remove: object => __brasiliaDisposeObject(object.userData.brasiliaContainer ?? object),
    fallback: (model, show) => { const fallback= fallbackGroups.get(model.id); if (fallback) fallback.visible=show; }
  });
  const fallbackGroups = fallbacks;
  // Atualiza visibilidade pelo grupo para conservar pivô e transformação da cena GLTF.
  const update = controller.update;
  const debug = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('model-debug')==='1';
  let debugAt=0;
  controller.update = (x,z) => { update(x,z); if(debug && Date.now()-debugAt>=1000) {debugAt=Date.now(); const metrics=window.__PAULISTA_METRICS__; const diagnostics={}; for(const key of ['fps','drawCalls','triangles']) if(Number.isFinite(metrics?.[key])) diagnostics[key]=metrics[key]; document.documentElement.dataset.brasiliaModels=JSON.stringify({...controller.stats(),...diagnostics});} for(const model of models) { const group=parent.children.find(o=>o.name==='brasilia-modelo-'+model.id); if(group) group.visible=Math.hypot(model.x-x,model.z-z)<(mobile?240:430); } };
  __brasiliaModelController = controller;
  window.addEventListener('pagehide', event => { if(!event.persisted) { controller.dispose(); draco.dispose(); } });
}
`;
}

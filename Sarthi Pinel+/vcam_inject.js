// Virtual webcam injector (transparent, height 100%, width auto). If you use this file elsewhere, ensure it's included.
// It mirrors the behaviors implemented in content.js' main-world shim.

(function(){
  let state = { enabled: false, image: '', fps: 15, force: true };

  function pushStateToPage(){
    try {
      window.postMessage({ __sp_vcam_state: true, enabled: !!state.enabled, image: String(state.image||''), fps: Number(state.fps||15), force: !!state.force }, '*');
    } catch {}
  }

  chrome.storage.local.get(['sp_vcam_enabled','sp_vcam_image','sp_vcam_fps','sp_vcam_force'], d=>{
    state.enabled = !!d.sp_vcam_enabled;
    state.image = d.sp_vcam_image || '';
    state.fps = d.sp_vcam_fps || 15;
    state.force = (d.sp_vcam_force == null) ? true : !!d.sp_vcam_force;
    pushStateToPage();
    // Ephemeral: clear any leftover on load
    try { chrome.storage.local.remove('sp_vcam_image'); } catch {}
  });

  chrome.storage.onChanged.addListener((changes, area)=>{
    if (area !== 'local') return;
    if (changes.sp_vcam_enabled) state.enabled = !!changes.sp_vcam_enabled.newValue;
    if (changes.sp_vcam_image) {
      state.image = changes.sp_vcam_image.newValue || '';
      // Clear after consume so it doesn't persist
      try { chrome.storage.local.remove('sp_vcam_image'); } catch {}
    }
    if (changes.sp_vcam_fps) state.fps = changes.sp_vcam_fps.newValue || 15;
    if (changes.sp_vcam_force) state.force = (changes.sp_vcam_force.newValue == null) ? true : !!changes.sp_vcam_force.newValue;
    pushStateToPage();
  });

  const code = `
    (function(){
      try{
        if (window.__sp_vcam_installed) return; window.__sp_vcam_installed = true;

        const VCAM_ID = 'sarthi-web';
        const VCAM_LABEL = 'Sarthi Web';
        let VCAM_ENABLED = false;
        let VCAM_FORCE = true;
        let VCAM_FPS = 15;
        let CURRENT_IMAGE = '';
        let ZOOM = 1.3; // zoom support

        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        let ctx = canvas.getContext('2d', { alpha: true });

        let img = new Image(); img.decoding='async'; img.loading='eager';
        let drawTimer = null;
        let stream = null;

        function draw(){
          const ch = canvas.height;
          const cw = canvas.width;
          ctx.clearRect(0,0,cw,ch);
          if (CURRENT_IMAGE && CURRENT_IMAGE.startsWith('data:image/')){
            if (img.src !== CURRENT_IMAGE) img.src = CURRENT_IMAGE;
            if (img.complete && img.naturalWidth>0){
              const iw=img.naturalWidth, ih=img.naturalHeight;
              const scale = (ch/ih) * Math.max(0.25, Math.min(4, ZOOM)); // apply zoom
              const dw = Math.max(1, Math.floor(iw * scale));
              const dh = ch;
              // Resize canvas width to match scaled image to avoid side bars
              if (canvas.width !== dw) {
                canvas.width = dw;
                ctx = canvas.getContext('2d', { alpha: true });
              }
              const dx = 0;
              const dy = 0;
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, dx, dy, dw, dh);
            }
          }
        }

        function start(){
          stop();
          const interval = Math.max(50, Math.floor(1000 / (VCAM_FPS || 15)));
          drawTimer = setInterval(draw, interval);
        }
        function stop(){ if (drawTimer){ clearInterval(drawTimer); drawTimer=null; } }

        function getVcamStream(){
          if (!stream){
            try { stream = canvas.captureStream(VCAM_FPS||15); } catch(e){ stream = canvas.captureStream(); }
            start(); draw();
          }
          return stream;
        }

        function wantsSarthi(constraints){
          try{
            if (VCAM_FORCE) return true;
            const v = constraints && constraints.video;
            if (!v) return VCAM_FORCE;
            const id = v.deviceId;
            function hasId(val){
              if (!val) return false;
              if (typeof val==='string') return val.includes(VCAM_ID) || val.includes(VCAM_LABEL);
              if (Array.isArray(val)) return val.some(x => String(x).includes(VCAM_ID) || String(x).includes(VCAM_LABEL));
              if (typeof val==='object' && ('exact' in val)) return hasId(val.exact);
              return false;
            }
            if (hasId(id)) return true;
            if (Array.isArray(v.advanced)){
              for (const adv of v.advanced){ if (hasId(adv?.deviceId)) return true; }
            }
            return VCAM_FORCE;
          }catch{ return true; }
        }

        const _enum = navigator.mediaDevices?.enumerateDevices?.bind(navigator.mediaDevices);
        if (_enum){
          navigator.mediaDevices.enumerateDevices = function(){
            return _enum().then(list=>{
              try{
                if (!Array.isArray(list)) list = [];
                if (VCAM_ENABLED){
                  const vdev = { kind:'videoinput', deviceId: VCAM_ID, groupId: VCAM_ID, label: VCAM_LABEL };
                  if (!list.some(d => (d.kind==='videoinput') && (d.deviceId===VCAM_ID))) list.unshift(vdev);
                }
              }catch(e){}
              return list;
            });
          };
        }

        const _gum = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
        if (_gum){
          navigator.mediaDevices.getUserMedia = function(constraints){
            if (VCAM_ENABLED && wantsSarthi(constraints)) return Promise.resolve(getVcamStream());
            return _gum(constraints);
          };
        }

        window.addEventListener('message', e=>{
          const d = e.data || {};
          if (d.__sp_vcam_state === true){
            VCAM_ENABLED = !!d.enabled;
            VCAM_FORCE = !!d.force;
            VCAM_FPS = Number(d.fps||15);
            if (typeof d.image === 'string' && d.image.startsWith('data:image/')) CURRENT_IMAGE = d.image;
            if (stream) start(); else if (VCAM_ENABLED) getVcamStream();
          } else if (d.__sp_vcam_zoom === true){
            let z = Number(d.zoom);
            if (!isFinite(z)) z = 1.3;
            ZOOM = Math.min(4, Math.max(0.25, z));
            draw();
          }
        }, false);
      }catch(e){}
    })();
  `;
  const s = document.createElement('script');
  s.textContent = code;
  (document.documentElement || document.head || document.body).appendChild(s);
  s.parentNode.removeChild(s);
})();
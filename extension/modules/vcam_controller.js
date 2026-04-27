// extension/modules/vcam_controller.js
// This module bridges the extension world and the MAIN world (vcam_inject.js).
(function () {
    'use strict';

    window.VcamController = {
        state: {
            enabled: true,
            image: '',
            fps: 15
        },

        init() {
            this.syncFromStorage();
            // Listen for storage changes
            chrome.storage.onChanged.addListener(async (changes, area) => {
                if (area !== 'local') return;
                if (changes.stall_user_photo) {
                    const du = changes.stall_user_photo.newValue || '';
                    const processed = await this.applyFilters(du);
                    this.state.image = processed;
                    this.pushToPage();
                }
            });
            console.log('[VCAM] Controller initialized with Auto-Beautify');
        },

        async syncFromStorage() {
            const data = await window.up_getStorage(['stall_user_photo', 'vcamEnabled']);
            this.state.enabled = data.vcamEnabled !== false;
            const processed = await this.applyFilters(data.stall_user_photo || '');
            this.state.image = processed;
            this.pushToPage();
        },

        // Sarthi Pinel+ logic: Apply brightness/contrast to improve recognition
        async applyFilters(inputDu) {
            if (!inputDu || !inputDu.startsWith('data:image/')) return inputDu;
            
            return new Promise((resolve) => {
                const def = { bri: 1.1, con: 1.1, sat: 1.1, hue: 0, qual: 0.92 }; // Optimal defaults
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const w = img.naturalWidth || 640;
                        const h = img.naturalHeight || 480;
                        const cvs = document.createElement('canvas');
                        cvs.width = w; cvs.height = h;
                        const ctx = cvs.getContext('2d');
                        ctx.save();
                        ctx.filter = `brightness(${def.bri}) contrast(${def.con}) saturate(${def.sat}) hue-rotate(${def.hue}deg)`;
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, w, h);
                        ctx.restore();
                        resolve(cvs.toDataURL('image/jpeg', def.qual));
                    } catch (e) { resolve(inputDu); }
                };
                img.onerror = () => resolve(inputDu);
                img.src = inputDu;
            });
        },

        pushToPage() {
            try {
                window.postMessage({
                    __sp_vcam_state: true,
                    enabled: !!this.state.enabled,
                    image: String(this.state.image || ''),
                    fps: Number(this.state.fps || 15)
                }, '*');
            } catch (e) {}
        }
    };

})();

/* @ts-self-types="./xalen_wasm.d.ts" */

export class XalenWasm {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        XalenWasmFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_xalenwasm_free(ptr, 0);
    }
    /**
     * @param {number} jd_ut1
     * @param {number} ayanamsa_id
     * @returns {number}
     */
    static ayanamsaDeg(jd_ut1, ayanamsa_id) {
        const ret = wasm.xalenwasm_ayanamsaDeg(jd_ut1, ayanamsa_id);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {number} body_id
     * @returns {string}
     */
    static bodyName(body_id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.xalenwasm_bodyName(body_id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Compute Ashta Koota (8-fold) compatibility from boy and girl Moon longitudes.
     * Inputs are sidereal Moon longitudes in degrees (0-360). Both the nakshatra
     * and the rashi are resolved from the same longitude so a Moon sitting near a
     * sign boundary maps to the correct rashi (the previous index-based mapping
     * assigned the wrong start-sign for 6 of the 27 nakshatras). Returns JSON with
     * all 8 koota scores.
     * @param {number} boy_moon_deg
     * @param {number} girl_moon_deg
     * @returns {string}
     */
    static compatibility(boy_moon_deg, girl_moon_deg) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.xalenwasm_compatibility(boy_moon_deg, girl_moon_deg);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Delta T (TT - UT1) in seconds at a given Julian Day.
     * Uses the Stephenson-Morrison-Hohenkerk 2016 model.
     * @param {number} jd
     * @returns {number}
     */
    static deltaT(jd) {
        const ret = wasm.xalenwasm_deltaT(jd);
        return ret;
    }
    /**
     * Compute the divisional (Varga) chart sign for a given longitude.
     * varga: 1=D1, 2=D2, 3=D3, 4=D4, 7=D7, 9=D9, 10=D10, 12=D12,
     *        16=D16, 20=D20, 24=D24, 27=D27, 30=D30, 40=D40, 45=D45, 60=D60.
     * Returns the rashi (sign) name in that divisional chart.
     * @param {number} lon_deg
     * @param {number} varga
     * @returns {string}
     */
    static divisionalChart(lon_deg, varga) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.xalenwasm_divisionalChart(lon_deg, varga);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} jd_ut1
     * @param {number} lat
     * @param {number} lon
     * @param {number} ayanamsa_id
     * @returns {string}
     */
    fullChartJson(jd_ut1, lat, lon, ayanamsa_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.xalenwasm_fullChartJson(this.__wbg_ptr, jd_ut1, lat, lon, ayanamsa_id);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} moon_sidereal_deg
     * @returns {string}
     */
    getNakshatra(moon_sidereal_deg) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.xalenwasm_getNakshatra(this.__wbg_ptr, moon_sidereal_deg);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} sidereal_deg
     * @returns {string}
     */
    getRashi(sidereal_deg) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.xalenwasm_getRashi(this.__wbg_ptr, sidereal_deg);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} jd_ut1
     * @param {number} lat
     * @param {number} lon
     * @param {number} system_id
     * @returns {string}
     */
    housesJson(jd_ut1, lat, lon, system_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.xalenwasm_housesJson(this.__wbg_ptr, jd_ut1, lat, lon, system_id);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} year
     * @param {number} month
     * @param {number} day
     * @param {number} hour
     * @returns {number}
     */
    static julianDay(year, month, day, hour) {
        const ret = wasm.xalenwasm_julianDay(year, month, day, hour);
        return ret;
    }
    /**
     * Structured nakshatra detail as JSON — the unified shape shared with the
     * Python (`nakshatra()` dict) and Node (`nakshatraInfo()`) bindings:
     * `{ "name", "pada", "lord", "deity", "index" }`. The legacy `getNakshatra`
     * string method is retained for backward compatibility.
     * @param {number} sidereal_deg
     * @returns {string}
     */
    nakshatraInfoJson(sidereal_deg) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.xalenwasm_nakshatraInfoJson(this.__wbg_ptr, sidereal_deg);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    constructor() {
        const ret = wasm.xalenwasm_new();
        this.__wbg_ptr = ret;
        XalenWasmFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} jd_ut1
     * @param {number} ayanamsa_id
     * @returns {string}
     */
    panchangJson(jd_ut1, ayanamsa_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.xalenwasm_panchangJson(this.__wbg_ptr, jd_ut1, ayanamsa_id);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Full geocentric position of a body as a JSON object: the six components
     * pyswisseph returns from `swe.calc_ut(..., FLG_SPEED)` plus a retrograde
     * flag. This is the high-fidelity counterpart to `tropicalLongitude` /
     * `siderealLongitude`, which discard everything but longitude.
     *
     * `ayanamsa_id` is honoured only when `sidereal` is true: the longitude is
     * made sidereal (tropical − ayanamsa) and the ayanamsa's own precession rate
     * is removed from `lon_speed`, matching Swiss `SEFLG_SIDEREAL | SEFLG_SPEED`.
     * `is_retrograde` is taken from the frame-independent tropical longitude rate.
     *
     * Returns JSON: `{ "longitude", "latitude", "distance", "lon_speed",
     * "lat_speed", "dist_speed", "is_retrograde" }`. Ketu (id 13) = Rahu + 180°,
     * sharing Rahu's speed and retrograde state.
     * @param {number} jd_ut1
     * @param {number} body_id
     * @param {boolean} sidereal
     * @param {number} ayanamsa_id
     * @returns {string}
     */
    planetPositionJson(jd_ut1, body_id, sidereal, ayanamsa_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.xalenwasm_planetPositionJson(this.__wbg_ptr, jd_ut1, body_id, sidereal, ayanamsa_id);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {number} jd_ut1
     * @param {number} body_id
     * @param {number} ayanamsa_id
     * @returns {number}
     */
    siderealLongitude(jd_ut1, body_id, ayanamsa_id) {
        const ret = wasm.xalenwasm_siderealLongitude(this.__wbg_ptr, jd_ut1, body_id, ayanamsa_id);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * @param {number} jd_ut1
     * @param {number} body_id
     * @returns {number}
     */
    tropicalLongitude(jd_ut1, body_id) {
        const ret = wasm.xalenwasm_tropicalLongitude(this.__wbg_ptr, jd_ut1, body_id);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * Compute the Vimshottari Dasha periods from Moon longitude and birth JD.
     * Returns JSON array of Mahadasha periods, each with Antardasha sub-periods.
     * On serialization failure, surfaces the error instead of silently returning
     * an empty string (which a caller could mistake for "no periods").
     * @param {number} moon_deg
     * @param {number} birth_jd
     * @returns {string}
     */
    static vimshottariDasha(moon_deg, birth_jd) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.xalenwasm_vimshottariDasha(moon_deg, birth_jd);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}
if (Symbol.dispose) XalenWasm.prototype[Symbol.dispose] = XalenWasm.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./xalen_wasm_bg.js": import0,
    };
}

const XalenWasmFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_xalenwasm_free(ptr, 1));

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        let metaUrl;
        try {
            metaUrl = new Function("return typeof import.meta !== 'undefined' ? import.meta.url : undefined")();
        } catch {
            metaUrl = undefined;
        }
        module_or_path = new URL('xalen_wasm_bg.wasm', metaUrl || 'http://localhost');
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };

/* tslint:disable */
/* eslint-disable */

export class XalenWasm {
    free(): void;
    [Symbol.dispose](): void;
    static ayanamsaDeg(jd_ut1: number, ayanamsa_id: number): number;
    static bodyName(body_id: number): string;
    /**
     * Compute Ashta Koota (8-fold) compatibility from boy and girl Moon longitudes.
     * Inputs are sidereal Moon longitudes in degrees (0-360). Both the nakshatra
     * and the rashi are resolved from the same longitude so a Moon sitting near a
     * sign boundary maps to the correct rashi (the previous index-based mapping
     * assigned the wrong start-sign for 6 of the 27 nakshatras). Returns JSON with
     * all 8 koota scores.
     */
    static compatibility(boy_moon_deg: number, girl_moon_deg: number): string;
    /**
     * Delta T (TT - UT1) in seconds at a given Julian Day.
     * Uses the Stephenson-Morrison-Hohenkerk 2016 model.
     */
    static deltaT(jd: number): number;
    /**
     * Compute the divisional (Varga) chart sign for a given longitude.
     * varga: 1=D1, 2=D2, 3=D3, 4=D4, 7=D7, 9=D9, 10=D10, 12=D12,
     *        16=D16, 20=D20, 24=D24, 27=D27, 30=D30, 40=D40, 45=D45, 60=D60.
     * Returns the rashi (sign) name in that divisional chart.
     */
    static divisionalChart(lon_deg: number, varga: number): string;
    fullChartJson(jd_ut1: number, lat: number, lon: number, ayanamsa_id: number): string;
    getNakshatra(moon_sidereal_deg: number): string;
    getRashi(sidereal_deg: number): string;
    housesJson(jd_ut1: number, lat: number, lon: number, system_id: number): string;
    static julianDay(year: number, month: number, day: number, hour: number): number;
    /**
     * Structured nakshatra detail as JSON — the unified shape shared with the
     * Python (`nakshatra()` dict) and Node (`nakshatraInfo()`) bindings:
     * `{ "name", "pada", "lord", "deity", "index" }`. The legacy `getNakshatra`
     * string method is retained for backward compatibility.
     */
    nakshatraInfoJson(sidereal_deg: number): string;
    constructor();
    panchangJson(jd_ut1: number, ayanamsa_id: number): string;
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
     */
    planetPositionJson(jd_ut1: number, body_id: number, sidereal: boolean, ayanamsa_id: number): string;
    siderealLongitude(jd_ut1: number, body_id: number, ayanamsa_id: number): number;
    tropicalLongitude(jd_ut1: number, body_id: number): number;
    /**
     * Compute the Vimshottari Dasha periods from Moon longitude and birth JD.
     * Returns JSON array of Mahadasha periods, each with Antardasha sub-periods.
     * On serialization failure, surfaces the error instead of silently returning
     * an empty string (which a caller could mistake for "no periods").
     */
    static vimshottariDasha(moon_deg: number, birth_jd: number): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_xalenwasm_free: (a: number, b: number) => void;
    readonly xalenwasm_ayanamsaDeg: (a: number, b: number) => [number, number, number];
    readonly xalenwasm_bodyName: (a: number) => [number, number];
    readonly xalenwasm_compatibility: (a: number, b: number) => [number, number, number, number];
    readonly xalenwasm_divisionalChart: (a: number, b: number) => [number, number, number, number];
    readonly xalenwasm_fullChartJson: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly xalenwasm_getNakshatra: (a: number, b: number) => [number, number];
    readonly xalenwasm_getRashi: (a: number, b: number) => [number, number];
    readonly xalenwasm_housesJson: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly xalenwasm_nakshatraInfoJson: (a: number, b: number) => [number, number];
    readonly xalenwasm_new: () => number;
    readonly xalenwasm_panchangJson: (a: number, b: number, c: number) => [number, number, number, number];
    readonly xalenwasm_planetPositionJson: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly xalenwasm_siderealLongitude: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly xalenwasm_tropicalLongitude: (a: number, b: number, c: number) => [number, number, number];
    readonly xalenwasm_vimshottariDasha: (a: number, b: number) => [number, number, number, number];
    readonly xalenwasm_julianDay: (a: number, b: number, c: number, d: number) => number;
    readonly xalenwasm_deltaT: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

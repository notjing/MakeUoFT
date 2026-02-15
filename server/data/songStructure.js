import e from "cors";
import {
    lowIntensityGenres,
    mediumIntensityGenres,
    highIntensityGenres,
    lowIntensityMoods,
    mediumIntensityMoods,
    highIntensityMoods,
    majorKeys,
    minorKeys,
    percussion,
    bass,
    harmony,
    melody
} from "./songInfo.js";

// ── HELPERS ───────────────────────────────────────────────────────────────────

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── STATE MANAGEMENT ──────────────────────────────────────────────────────────

const DEFAULT_INSTRUMENT_MAP = {
    // ... (Your instrument list remains the same)
    "808 Hip Hop Beat": false, "Bongos": false, "Drumline": false, "Drum Set": false, "Explosions": false,
    "Steel Drum": false, "Timpani": false,
    "Bass Clarinet": false, "Cello": false, "Didgeridoo": false,
    "Tuba": false, "Upright Bass": false,
    "Accordion": false, "Dirty Synths": false, "Electric Guitar": false,
    "Electric Piano": false, "Flamenco Guitar": false, "Guitar": false,
    "Harmonica": false, "Harp": false, "Harpsichord": false, "Moog Oscillations": false,
    "Smooth Pianos": false, "Spacey Synths": false,
    "Synth Pads": false, "Viola Ensemble": false, "Warm Acoustic Guitar": false,
    "Alto Saxophone": false, "Bagpipes": false, "Clarinet": false, "Flute": false,
    "French Horn": false, "Piccolo": false, "Trombone": false, "Trumpet": false, "Violin": false,
    "Glockenspiel": false, "Marimba": false, "Piano": false
};

// Track the last sent BPM to prevent API spamming
let lastSentBPM = 0;

let activeContext = {
    genre: null,
    bpm: 124,
    key: null,
    instruments: { ...DEFAULT_INSTRUMENT_MAP },
    moods: []
};

// ── UPDATED BIO HANDLER ──────────────────────────────────────────────────────

export function handleBioUpdate(packet, conductor) {
    if (!conductor) return;
    const { bpm, gsr, temp } = packet.data;
    
    // 1. Calculate Key
    const keyCalc = (36 - temp) + (50 - gsr) + (80 - bpm);
    if (keyCalc > 0 && (activeContext.key == null || activeContext.key.split(" ")[1] == "Minor")) {
        activeContext.key = pick(majorKeys);
    } else if (keyCalc <= 0 && (activeContext.key == null || activeContext.key.split(" ")[1] == "Major")) {
        activeContext.key = pick(minorKeys);
    }

    // 2. Calculate Target BPM
    const calculatedBPM = bpm * 5 / 4 + 17.5;
    activeContext.bpm = calculatedBPM;

    // 3. FORCE MUSIC CONFIGURATION HERE
    // We check if the BPM has changed significantly (e.g., > 3 BPM diff) to avoid glitching
    if (Math.abs(calculatedBPM - lastSentBPM) > 3) {
        const finalBPM = Math.round(calculatedBPM);
        
        console.log(`Bio Update triggering BPM change: ${lastSentBPM} -> ${finalBPM}`);
        
        if (typeof setMusicGenerationConfig === "function") {
            setMusicGenerationConfig({
                musicGenerationConfig: {
                    bpm: finalBPM
                }
            });
            lastSentBPM = finalBPM; // Update tracker
        }
    }
}

export function handleUserUpdate(data) {
    // ... (Your existing code)
    if (data.genre) activeContext.genre = data.genre;
    if (data.moods) activeContext.moods = data.moods;
    if (data.instruments && Array.isArray(data.instruments)) {
        const nextInstruments = { ...DEFAULT_INSTRUMENT_MAP };
        data.instruments.forEach((instName) => {
            if (nextInstruments.hasOwnProperty(instName)) nextInstruments[instName] = true;
        });
        activeContext.instruments = nextInstruments;
    }
}

export function handleCameraContext(raw_data) {
    // ... (Your existing code)
    const data = JSON.parse(raw_data);
    if (data) {
        activeContext.genre = data.genre || null;
        activeContext.moods = data.moods || [];
        const nextInstruments = { ...DEFAULT_INSTRUMENT_MAP };
        if (data.instruments && Array.isArray(data.instruments)) {
            data.instruments.forEach((instName) => {
                if (nextInstruments.hasOwnProperty(instName)) nextInstruments[instName] = true;
            });
        }
        if (data.genre) activeContext.genre = data.genre;
        activeContext.instruments = nextInstruments;
    }
}

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────

export const generateSongPackage = () => {
    // ... (Selections remain the same)
    const intensity = pick(["low", "med", "high"]);
    const key = activeContext.key ? activeContext.key : pick(majorKeys.concat(minorKeys));
    const defaultGenreList = intensity === "low" ? lowIntensityGenres : intensity === "med" ? mediumIntensityGenres : highIntensityGenres;
    const defaultMoodList = intensity === "low" ? lowIntensityMoods : intensity === "med" ? mediumIntensityMoods : highIntensityMoods;
    const genre = activeContext.genre ? activeContext.genre : pick(defaultGenreList);
    const mood = (activeContext.moods && activeContext.moods.length > 0) ? pick(activeContext.moods) : pick(defaultMoodList);

    let activeInstrumentList = Object.keys(activeContext.instruments).filter(
        (key) => activeContext.instruments[key] === true
    );
    const band = activeInstrumentList;

    const myBass = band.filter(i => bass.includes(i));
    const myHarmony = band.filter(i => harmony.includes(i));
    const myMelody = band.filter(i => melody.includes(i));
    const myPercussion = band.filter(i => percussion.includes(i));

    const getInst = (role) => {
        let pool = [];
        if (role === 'bass') pool = myBass;
        else if (role === 'harmony') pool = myHarmony;
        else if (role === 'melody') pool = myMelody;
        else if (role === 'percussion') pool = myPercussion;
        if (myMelody.length === 0) myMelody.push("Piano");
        if (pool.length > 0) return pick(pool);
        return getInst('melody');
    };

    // ── NEW HELPER: TEMPO DESCRIPTOR ──────────────────────────────────────────
    // This ensures the text prompt supports the hard-coded BPM config
    const getTempoDescriptor = (bpmVal) => {
        if (bpmVal < 80) return "slow downtempo, very relaxed speed";
        if (bpmVal < 110) return "moderate mid-tempo groove";
        if (bpmVal < 130) return "upbeat energetic tempo";
        return "very fast, high-speed aggressive tempo";
    };

    const tempoText = getTempoDescriptor(activeContext.bpm);

    const getGenreStyle = () => {
       // ... (Your existing genre map)
       const genreStyles = {
           "EDM": "four-on-the-floor dance", "House": "groovy house", "Techno": "repetitive techno",
           "Ambient": "ethereal ambient", "Synthwave": "retro 80s synthwave", "Drum and Bass": "fast jungle breakbeats",
           "Jazz": "improvisational jazz", "Classical": "orchestral classical", "Folk": "acoustic folk",
           "Blues": "soulful blues", "Country": "twangy country", "Hip Hop": "boom-bap hip hop",
           "R&B": "smooth R&B", "Pop": "catchy pop", "Rock": "driving rock", "Metal": "aggressive metal",
           "Indie": "lo-fi indie", "Latin": "Latin rhythms", "Reggae": "offbeat reggae", "Afrobeat": "polyrhythmic afrobeat"
       };
       return genreStyles[genre] || `${genre}-inspired`;
    };

    const getMoodTexture = () => {
        // ... (Your existing mood map)
        const moodTextures = {
            "happy": "bright, uplifting", "sad": "melancholic", "energetic": "high-octane",
            "calm": "peaceful", "dark": "brooding", "uplifting": "soaring", "aggressive": "intense",
            "dreamy": "hazy", "nostalgic": "warm vintage", "epic": "cinematic"
        };
        return moodTextures[mood] || `${mood} feeling`;
    };

    const style = getGenreStyle();
    const texture = getMoodTexture();
    const activeList = band.length > 0 ? band.join(", ") : "Piano";
    const primaryMelody = getInst('melody');
    const primaryHarmony = getInst('harmony');
    const primaryBass = getInst('bass');
    const primaryPercussion = getInst('percussion');

    // ── GLOBAL CONTEXT ────────────────────────────────────────────────────────

    // Also set config on initial load
    if (typeof setMusicGenerationConfig === "function") {
        setMusicGenerationConfig({
            musicGenerationConfig: {
                bpm: Math.round(activeContext.bpm)
            }
        });
        lastSentBPM = Math.round(activeContext.bpm);
    }

    // We inject 'tempoText' into the prompt so the model understands the speed semantically
    const globalContext = `Studio recording session with exactly these instruments: ${activeList}. 
This is a ${genre} track in ${key}, ${mood} mood. The speed is ${tempoText}.
The only musicians present are playing: ${activeList}. 
MIXING: ${primaryMelody} is the loudest. Percussion should not overpower.`;

    // ── TIMELINE ──────────────────────────────────────────────────────────────

    // Added ${tempoText} to the prompt strings to reinforce speed changes in text
    const timeline = [
        {
            id: "Intro",
            durationMs: 20_000,
            prompt: `Recording: ${activeList} playing a ${genre} intro. ${tempoText}. ${primaryMelody} plays opening melody LOUD. ${primaryHarmony} supports. ${texture}. Mix: ${primaryMelody} on top.`,
            transitionWindowMs: 0,
            transitionInstruction: null
        },
        {
            id: "Intro Build",
            durationMs: 10_000,
            prompt: `Live recording of ${activeList}. ${genre} atmosphere builds at ${tempoText}. ${primaryMelody} plays expressive phrase LOUDLY. ${primaryHarmony} texture. Mix: ${primaryMelody} dominant.`,
            transitionWindowMs: 5_000,
            transitionInstruction: `${primaryBass} becomes prominent, ${primaryMelody} stays loudest.`
        },
        {
            id: "Verse 1",
            durationMs: 15_000,
            prompt: `${genre} verse. ${tempoText}. ${primaryMelody} plays verse melody LOUD. ${primaryBass} bass line underneath. ${texture}. Mix: ${primaryMelody} loudest.`,
            transitionWindowMs: 4_000,
            transitionInstruction: `${primaryMelody} melody intensifies.`
        },
        {
            id: "Build-Up",
            durationMs: 5_000,
            prompt: `${genre} build. ${tempoText}. ${primaryMelody} plays rising figures LOUD. Tension mounts. Mix: ${primaryMelody} dominates.`,
            transitionWindowMs: 1_500,
            transitionInstruction: `Pause, then ${primaryMelody} enters with hook.`
        },
        {
            id: "Chorus (Drop)",
            durationMs: 15_000,
            prompt: `${genre} chorus! ${primaryMelody} plays main hook LOUD. ${primaryBass} heavy. ${tempoText}. ${mood} peak. Mix: ${primaryMelody} maximum.`,
            transitionWindowMs: 5_000,
            transitionInstruction: `Energy reduces, ${primaryMelody} stays loudest.`
        },
        {
            id: "Interlude",
            durationMs: 10_000,
            prompt: `${genre} interlude. ${tempoText}. ${primaryMelody} plays gentle melody UPFRONT. ${primaryBass} sparse. Mix: ${primaryMelody} prominent.`,
            transitionWindowMs: 3_000,
            transitionInstruction: `${primaryMelody} melody builds again.`
        },
        {
            id: "Solo",
            durationMs: 15_000,
            prompt: `${genre} solo. ${primaryMelody} virtuosic solo at MAXIMUM VOLUME. ${tempoText}. ${primaryPercussion} accompanies. Mix: ${primaryMelody} way up front.`,
            transitionWindowMs: 5_000,
            transitionInstruction: `${primaryMelody} solo winds down.`
        },
        {
            id: "Bridge",
            durationMs: 10_000,
            prompt: `${genre} bridge. ${primaryMelody} tender melody UPFRONT. ${tempoText}. Soft dynamics. Mix: ${primaryMelody} clear.`,
            transitionWindowMs: 4_000,
            transitionInstruction: `${primaryPercussion} builds quietly.`
        },
        {
            id: "Final Chorus",
            durationMs: 15_000,
            prompt: `${genre} finale! ${primaryMelody} plays final melody FULL POWER. ${tempoText}. Maximum energy. Mix: ${primaryMelody} absolute maximum.`,
            transitionWindowMs: 5_000,
            transitionInstruction: `Instruments exit, ${primaryMelody} plays final notes.`
        },
        {
            id: "Outro",
            durationMs: 10_000,
            prompt: `${genre} outro. ${primaryMelody} fading melody, still LOUDEST. ${tempoText}. ${mood} resolution in ${key}. Mix: ${primaryMelody} on top.`,
            transitionWindowMs: 0,
            transitionInstruction: null
        }
    ];

    return { globalContext, timeline, activeInstruments: band, activeGenre: genre, activeMood: mood };
};
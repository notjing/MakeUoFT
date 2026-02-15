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

// Helper: Pick 1 random element
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper: Pick 'n' unique random elements
const pickMultiple = (arr, n) => {
    return [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
};

// ── STATE MANAGEMENT ──────────────────────────────────────────────────────────

const DEFAULT_INSTRUMENT_MAP = {
    // Percussion / FX
    "808 Hip Hop Beat": false, "Bongos": false, "Drumline": false, "Drum Set": false, "Explosions": false,
    "Steel Drum": false, "Timpani": false,

    // Bass
    "Bass Clarinet": false, "Cello": false, "Didgeridoo": false,
    "Tuba": false, "Upright Bass": false,

    // Harmony
    "Accordion": false, "Dirty Synths": false, "Electric Guitar": false,
    "Electric Piano": false, "Flamenco Guitar": false, "Guitar": false,
    "Harmonica": false, "Harp": false, "Harpsichord": false, "Moog Oscillations": false,
    "Smooth Pianos": false, "Spacey Synths": false,
    "Synth Pads": false, "Viola Ensemble": false, "Warm Acoustic Guitar": false,

    // Melody
    "Alto Saxophone": false, "Bagpipes": false, "Clarinet": false, "Flute": false,
    "French Horn": false, "Piccolo": false, "Trombone": false, "Trumpet": false, "Violin": false,
    "Glockenspiel": false, "Marimba": false, "Piano": false
};

let activeContext = {
    genre: null,
    bpm: 124,
    key: null,
    instruments: {...DEFAULT_INSTRUMENT_MAP},
    moods: []
};

export function handleUserUpdate(data) {
    console.log("User Update Received:", data);

    // 1. Update Genres & Moods
    if (data.genre) activeContext.genre = data.genre;
    if (data.moods) activeContext.moods = data.moods;

    // 2. Update Instruments
    if (data.instruments && Array.isArray(data.instruments)) {
        // Reset all to false first so we only play what is currently selected
        const nextInstruments = {...DEFAULT_INSTRUMENT_MAP};

        data.instruments.forEach((instName) => {
            // Only set true if it exists in our map (prevents typos/errors)
            if (nextInstruments.hasOwnProperty(instName)) {
                nextInstruments[instName] = true;
            }
        });

        activeContext.instruments = nextInstruments;
    }
}

export function handleBioUpdate(packet, conductor) {
    if (!conductor) return;
    const {bpm, gsr, temp} = packet.data;
    console.log("BPM:", bpm, "GSR:", gsr, "Temp:", temp);

    const keyCalc = (36 - temp) + (50 - gsr) + (80 - bpm)

    if (keyCalc > 0 && (activeContext.key == null || activeContext.key.split(" ")[1] == "Minor")) {
        activeContext.key = pick(majorKeys)
    } else if (keyCalc <= 0 && (activeContext.key == null || activeContext.key.split(" ")[1] == "Major")) {
        activeContext.key = pick(minorKeys)
    }

    activeContext.bpm = bpm * 5 / 4 + 17.5;
}

export function handleCameraContext(raw_data) {
    const data = JSON.parse(raw_data)
    if (data) {
        console.log("Context Received:", data);
        console.log(data.instruments)

        activeContext.genre = data.genre || null;
        activeContext.moods = data.moods || [];

        // Reset instruments to default (all false)
        const nextInstruments = {...DEFAULT_INSTRUMENT_MAP};

        // Update with incoming data
        if (data.instruments && Array.isArray(data.instruments)) {
            data.instruments.forEach((instName) => {
                if (nextInstruments.hasOwnProperty(instName)) {
                    nextInstruments[instName] = true;
                }
            });
        }

        if (data.genre){
            activeContext.genre = data.genre;
        }

        activeContext.instruments = nextInstruments;
    }
}

// ── MAIN GENERATOR ────────────────────────────────────────────────────────────

export const generateSongPackage = () => {
    // 1. Determine Intensity & Key
    const intensity = pick(["low", "med", "high"]);
    const key = activeContext.key ? activeContext.key : pick(majorKeys.concat(minorKeys));

    // 2. Define Defaults based on Intensity (Restored Logic)
    const defaultGenreList = intensity === "low" ? lowIntensityGenres : intensity === "med" ? mediumIntensityGenres : highIntensityGenres;
    const defaultMoodList = intensity === "low" ? lowIntensityMoods : intensity === "med" ? mediumIntensityMoods : highIntensityMoods;

    // 3. Resolve Context (User Selection vs Fallback)
    const genre = activeContext.genre ? activeContext.genre : pick(defaultGenreList);
    const mood = (activeContext.moods && activeContext.moods.length > 0)
        ? pick(activeContext.moods)
        : pick(defaultMoodList);

    // 4. Resolve Instruments
    // Get list of currently "true" instruments from the map
    let activeInstrumentList = Object.keys(activeContext.instruments).filter(
        (key) => activeContext.instruments[key] === true
    );

    // Fallback: If no instruments selected, pick 4 random ones from defaults
    const band = activeInstrumentList
    // 5. Categorize the Band
    // Filter the active 'band' against our known lists to create pools for logic
    const myBass = band.filter(i => bass.includes(i));
    const myHarmony = band.filter(i => harmony.includes(i));
    const myMelody = band.filter(i => melody.includes(i));
    const myPercussion = band.filter(i => percussion.includes(i));

    // 6. Smart Picker Function
    // Returns a specific instrument for a specific role (e.g. "Get me a bass instrument")
    const getInst = (role) => {
        let pool = [];
        if (role === 'bass') pool = myBass;
        else if (role === 'harmony') pool = myHarmony;
        else if (role === 'melody') pool = myMelody;
        else if (role === 'percussion') pool = myPercussion;

        if (myMelody.length === 0) {
            myMelody.push("Piano");
        }

        // 1. Best case: Use the instrument the user picked for this role
        if (pool.length > 0) return pick(pool);

        return getInst('melody');
    };


    // 7. Dynamic prompt helpers based on genre/mood
    const getGenreStyle = () => {
        const genreStyles = {
            // Electronic
            "EDM": "four-on-the-floor electronic dance",
            "House": "groovy house with shuffled hi-hats",
            "Techno": "hypnotic repetitive techno",
            "Ambient": "ethereal ambient soundscape",
            "Synthwave": "retro 80s synthwave",
            "Drum and Bass": "fast-paced jungle breakbeats",
            // Acoustic/Traditional
            "Jazz": "improvisational jazz swing",
            "Classical": "orchestral classical",
            "Folk": "acoustic folk storytelling",
            "Blues": "soulful blues with bent notes",
            "Country": "twangy country",
            // Modern
            "Hip Hop": "boom-bap hip hop groove",
            "R&B": "smooth R&B with neo-soul",
            "Pop": "catchy pop hooks",
            "Rock": "driving rock energy",
            "Metal": "aggressive metal power",
            "Indie": "lo-fi indie aesthetic",
            // World
            "Latin": "Latin rhythms with clave patterns",
            "Reggae": "offbeat reggae skank",
            "Afrobeat": "polyrhythmic afrobeat"
        };
        return genreStyles[genre] || `${genre}-inspired`;
    };

    const getMoodTexture = () => {
        const moodTextures = {
            "happy": "bright, uplifting energy",
            "sad": "melancholic, introspective tones",
            "energetic": "high-octane, driving intensity",
            "calm": "peaceful, serene atmosphere",
            "dark": "brooding, mysterious undertones",
            "uplifting": "soaring, euphoric feeling",
            "aggressive": "intense, powerful attack",
            "dreamy": "hazy, floating textures",
            "nostalgic": "warm, vintage character",
            "epic": "cinematic, grandiose scale"
        };
        return moodTextures[mood] || `${mood} feeling`;
    };

    const style = getGenreStyle();
    const texture = getMoodTexture();

    // Build instrument list string for prompts
    console.log("Active Band:", band);
    const activeList = band.length > 0 ? band.join(", ") : "Piano";
    const primaryMelody = getInst('melody');
    const primaryHarmony = getInst('harmony');
    const primaryBass = getInst('bass');
    const primaryPercussion = getInst('percussion');

    // Frame as a specific recording session with only these instruments present
    const globalContext = `Studio recording session with exactly these instruments in the room: ${activeList}. 
This is a ${genre} track in ${key}, ${mood} mood, ${activeContext.bpm} BPM.
The only musicians present are playing: ${activeList}. No other instruments exist in this recording. All instruments should not have any super long periods of silence.
MIXING: ${primaryMelody} is the loudest and most powerful instrument in the mix, sitting on top. Percussion should not overpower any instrument.
All other instruments are mixed quieter to support ${primaryMelody}.`;

    // 8. Generate Timeline - each prompt explicitly states the ONLY instruments being recorded
    // MELODY INSTRUMENT (${primaryMelody}) should be featured prominently in every section and LOUDEST in the mix
    const timeline = [
        {
            id: "Intro",
            durationMs: 20_000,
            prompt: `Recording: ${activeList} playing a ${genre} intro. ${primaryMelody} plays the opening melody LOUD and upfront, gentle and inviting. ${primaryHarmony} supports quietly with soft chords. ${primaryPercussion} adds gentle rhythm in the background. ${texture}. ${primaryMelody} is the loudest, lead voice. Mix: ${primaryMelody} on top, others underneath. This recording contains: ${activeList}.`,
            transitionWindowMs: 0,
            transitionInstruction: null
        },
        {
            id: "Intro Build",
            durationMs: 10_000,
            prompt: `Live recording of ${activeList}. ${genre} atmosphere builds. ${primaryMelody} plays an expressive melodic phrase LOUDLY, building intensity. ${primaryHarmony} creates quiet texture underneath. ${primaryPercussion} establishes groove at lower volume. ${primaryMelody} leads the ensemble at highest volume. Mix: ${primaryMelody} dominant. Only these instruments are audible: ${activeList}.`,
            transitionWindowMs: 5_000,
            transitionInstruction: `${primaryBass} becomes prominent, ${primaryMelody} melody develops further, staying loudest.`
        },
        {
            id: "Verse 1",
            durationMs: 15_000,
            prompt: `${genre} verse. ${primaryMelody} plays the verse melody LOUD, lyrical and flowing, sitting on top of the mix. ${primaryPercussion} groove quietly. ${primaryHarmony} chords softly. ${primaryBass} bass line underneath. ${texture}. ${primaryMelody} carries the main tune at highest volume. Mix levels: ${primaryMelody} loudest, others support. Isolated recording of: ${activeList}.`,
            transitionWindowMs: 4_000,
            transitionInstruction: `${primaryMelody} melody intensifies, staying loudest, energy builds.`
        },
        {
            id: "Build-Up",
            durationMs: 5_000,
            prompt: `${genre} build. ${primaryMelody} plays rising melodic figures LOUD and upfront, building anticipation. ${primaryPercussion} rolls quietly. Tension mounts. ${primaryMelody} reaches higher notes, loudest in mix. Mix: ${primaryMelody} dominates. Recording of ${activeList}.`,
            transitionWindowMs: 1_500,
            transitionInstruction: `Pause, then ${primaryMelody} enters LOUD with the hook.`
        },
        {
            id: "Chorus (Drop)",
            durationMs: 15_000,
            prompt: `${genre} chorus! ${primaryMelody} plays the main hook melody LOUD and powerful, sitting on top of the mix. ${primaryBass} heavy but underneath. ${primaryPercussion} driving but below melody. ${primaryHarmony} full but supportive. ${mood} peak. ${primaryMelody} soars LOUDEST above everything. Mix: ${primaryMelody} at maximum, others lower. Full band recording: ${activeList}.`,
            transitionWindowMs: 5_000,
            transitionInstruction: `Energy reduces, ${primaryMelody} melody softens but stays loudest.`
        },
        {
            id: "Interlude",
            durationMs: 10_000,
            prompt: `${genre} interlude. ${primaryMelody} plays a gentle, reflective melody UPFRONT and clear. ${primaryBass} and ${primaryHarmony} provide sparse, quiet support. ${mood} atmosphere. ${primaryMelody} sings sweetly at highest volume. Mix: ${primaryMelody} prominent, others ambient. Session musicians: ${activeList}.`,
            transitionWindowMs: 3_000,
            transitionInstruction: `${primaryMelody} melody builds again, staying on top.`
        },
        {
            id: "Solo",
            durationMs: 15_000,
            prompt: `${genre} solo. ${primaryMelody} takes center stage LOUD with a virtuosic, improvised solo melody. Fast runs, expressive bends, emotional playing at MAXIMUM VOLUME. ${primaryPercussion} accompanies quietly. ${primaryMelody} is the star, loudest instrument. Mix: ${primaryMelody} way up front, everything else way back. Recording session with: ${activeList}.`,
            transitionWindowMs: 5_000,
            transitionInstruction: `${primaryMelody} solo winds down gracefully, still loudest.`
        },
        {
            id: "Bridge",
            durationMs: 10_000,
            prompt: `${genre} bridge. ${primaryMelody} plays a tender, emotional melody CLEARLY and upfront. ${primaryHarmony} plays ${mood} chords quietly underneath. Soft dynamics but ${primaryMelody} still loudest. ${primaryMelody} expresses deep feeling at top of mix. Mix: ${primaryMelody} clear and present. Studio recording of: ${activeList}.`,
            transitionWindowMs: 4_000,
            transitionInstruction: `${primaryPercussion} builds quietly, ${primaryMelody} prepares for loud finale.`
        },
        {
            id: "Final Chorus",
            durationMs: 15_000,
            prompt: `${genre} finale! ${primaryMelody} plays the triumphant final melody at FULL POWER, LOUDEST in the mix. Maximum energy. ${primaryPercussion} powerful but below melody. ${primaryBass} driving but underneath. ${primaryHarmony} full but supporting. ${primaryMelody} is glorious, soaring, and DOMINANT in volume. Mix: ${primaryMelody} at absolute maximum. Full band: ${activeList}.`,
            transitionWindowMs: 5_000,
            transitionInstruction: `Instruments exit, ${primaryMelody} plays final notes LOUD and clear.`
        },
        {
            id: "Outro",
            durationMs: 10_000,
            prompt: `${genre} outro. ${primaryMelody} plays a fading, gentle closing melody, still the LOUDEST and clearest element. ${primaryPercussion} and ${primaryBass} fade out quietly. ${mood} resolution in ${key}. ${primaryMelody} has the last word, upfront in the mix. Mix: ${primaryMelody} on top until the end. Final notes from: ${activeList}.`,
            transitionWindowMs: 0,
            transitionInstruction: null
        }
    ];

    return {globalContext, timeline, activeInstruments: band, activeGenre: genre, activeMood: mood};
};
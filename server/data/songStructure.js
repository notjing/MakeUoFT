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

    const globalContext = `YOU MUST PLAY THE INSTRUMENTS PROVIDED. YOU CAN ONLY PLAY FROM THE INSTRUMENTS PROVIDED. THE LAST TWO MESSAGES ARE THE MOST IMPORTANT CRITERIA. IF YOU ARE REQUESTED TO INCORPORATE AN INSTRUMENT, DO NOT IGNORE IT BECAUSE OF THE GENRE/MOOD.
  Key: ${key}. Genre: ${genre}. Mood: ${mood}.  BPM: ${activeContext.bpm}. High Fidelity.`;


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
    const activeList = band.length > 0 ? band.join(", ") : "synthesizers";
    const primaryMelody = getInst('melody');
    const primaryHarmony = getInst('harmony');
    const primaryBass = getInst('bass');
    const primaryPercussion = getInst('percussion');

    // 8. Generate Timeline with dynamic, context-aware prompts
    const instrumentRestriction = `PLEASE ONLY PLAY FROM THE AVAILABLE INSTRUMENTS: ${activeList}.`;
    const timeline = [
        {
            id: "Intro",
            durationMs: 20_000,
            prompt: `${genre} intro. ${texture}. Sparse ${primaryHarmony} establishing the ${key} tonality. Gentle ${primaryPercussion} pulse emerging. ${instrumentRestriction}`,
            transitionWindowMs: 0,
            transitionInstruction: null
        },
        {
            id: "Intro Build",
            durationMs: 10_000,
            prompt: `Continue ${genre} style. Atmospheric ${primaryHarmony} with filtered rhythm on ${primaryPercussion}. Low energy, ${mood} vibe. ${primaryMelody} textures beginning to emerge. ${instrumentRestriction}`,
            transitionWindowMs: 5_000,
            transitionInstruction: `Slowly opening the filter, ${primaryBass} starting to pulse, introducing ${primaryMelody} motifs.`
        },
        {
            id: "Verse 1",
            durationMs: 15_000,
            prompt: `${genre} verse. ${primaryPercussion} establishes steady ${genre} groove. ${primaryHarmony} playing characteristic ${genre} chord voicings. ${primaryBass} locking in with the rhythm. ${texture}. ${instrumentRestriction}`,
            transitionWindowMs: 4_000,
            transitionInstruction: `Building tension with rising ${primaryMelody} phrases and intensifying ${primaryPercussion}.`
        },
        {
            id: "Build-Up",
            durationMs: 5_000,
            prompt: `${genre} build-up section. ${primaryPercussion} rolling and building momentum. Rising pitch on ${primaryMelody}. High tension, anticipation. No bass, creating space for the drop. ${instrumentRestriction}`,
            transitionWindowMs: 1_500,
            transitionInstruction: `Sudden silence, then massive ${genre}-style impact.`
        },
        {
            id: "Chorus (Drop)",
            durationMs: 15_000,
            prompt: `Peak ${genre} energy! Full ${texture}. Heavy ${primaryBass} driving the low end. Powerful ${primaryPercussion} groove. ${primaryMelody} playing the main hook. ${primaryHarmony} filling the spectrum. Maximum ${mood} intensity. ${instrumentRestriction}`,
            transitionWindowMs: 5_000,
            transitionInstruction: `Energy gradually fading, ${primaryBass} becoming sparse, ${primaryPercussion} simplifying.`
        },
        {
            id: "Interlude",
            durationMs: 10_000,
            prompt: `Stripped back ${genre} groove. Just ${primaryBass} and ${primaryHarmony} interplay. Spacey reverb, atmospheric textures. ${mood} undertones. Breathing room. ${instrumentRestriction}`,
            transitionWindowMs: 3_000,
            transitionInstruction: `${primaryMelody} re-entering with a new melodic idea.`
        },
        {
            id: "Solo",
            durationMs: 15_000,
            prompt: `${genre}-style solo section. ${primaryPercussion} maintaining the groove. ${primaryMelody} taking an expressive, improvised solo with ${mood} character. Virtuosic but fitting the ${genre} aesthetic. ${instrumentRestriction}`,
            transitionWindowMs: 5_000,
            transitionInstruction: `${primaryMelody} solo fading, drums becoming sparse, preparing for breakdown.`
        },
        {
            id: "Bridge",
            durationMs: 10_000,
            prompt: `Emotional ${genre} breakdown. Minimal percussion. ${primaryHarmony} playing lush, ${mood} chords. Cinematic ${texture}. Building anticipation for final section. ${instrumentRestriction}`,
            transitionWindowMs: 4_000,
            transitionInstruction: `${primaryPercussion} building rapidly, rising tension, anticipating the final climax.`
        },
        {
            id: "Final Chorus",
            durationMs: 15_000,
            prompt: `Ultimate ${genre} climax! All instruments at full power: ${activeList}. ${texture} at maximum. ${primaryMelody} playing euphoric hook, ${primaryPercussion} at full energy, ${primaryBass} driving hard. Peak ${mood} emotion. ${instrumentRestriction}`,
            transitionWindowMs: 5_000,
            transitionInstruction: `Instruments dropping out one by one, leaving space.`
        },
        {
            id: "Outro",
            durationMs: 10_000,
            prompt: `${genre} outro. Just ${primaryPercussion} and ${primaryBass} remaining. ${mood} resolution. Fading into reverb, tempo gently slowing. Peaceful ending in ${key}. ${instrumentRestriction}`,
            transitionWindowMs: 0,
            transitionInstruction: null
        }
    ];

    return {globalContext, timeline, activeInstruments: band};
};
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
  SafeAreaView
} from "react-native";
import { Audio } from "expo-av";
import { socket } from "@/services/socket";
import { enqueueChunk, clearAudio } from "@/services/audioPlayer.js";

// ── DATA ──────────────────────────────────────────────────────────────────────
const BASS = ["Bass Clarinet", "Cello", "Didgeridoo", "Tuba", "Upright Bass"];
const HARMONY = [
  "Accordion", "Dirty Synths", "Electric Guitar", "Electric Piano", "Flamenco Guitar",
  "Guitar", "Harmonica", "Harp", "Harpsichord", "Moog Oscillations", "Ragtime Piano",
  "Smooth Pianos", "Spacey Synths", "Synth Pads", "Viola Ensemble", "Warm Acoustic Guitar"
];
const MELODY = [
  "Alto Saxophone", "Bagpipes", "Clarinet", "Flute", "French Horn",
  "Piccolo", "Trombone", "Trumpet", "Violin"
];

const GENRES = ["Lofi", "Ambient", "Cinematic", "Drone", "Jazz", "Synthwave"];
const MOODS = ["Chill", "Dark", "Energetic", "Ethereal", "Focus", "Melancholic", "Uplifting"];

const TABS = ["INSTRUMENTS", "GENRES", "MOODS"];

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;

// ── AUDIO UTILS ──────────────────────────────────────────────────────────────
function base64ToAudioBuffer(ctx, b64) {
  if (!b64) return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const samplesPerChannel = Math.floor(int16.length / CHANNELS);
    const audioBuffer = ctx.createBuffer(CHANNELS, samplesPerChannel, SAMPLE_RATE);
    for (let ch = 0; ch < CHANNELS; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < samplesPerChannel; i++) {
        channelData[i] = int16[i * CHANNELS + ch] / 32768;
      }
    }
    return audioBuffer;
  } catch (e) {
    console.error("Audio conversion error:", e);
    return null;
  }
}

export default function Button() {
  const [isOn, setIsOn] = useState(false);
  const [status, setStatus] = useState("READY");
  
  // Selection State
  const [selectedInstruments, setSelectedInstruments] = useState(new Set());
  const [selectedGenres, setSelectedGenres] = useState(new Set());
  const [selectedMoods, setSelectedMoods] = useState(new Set());
  
  // UI State
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("INSTRUMENTS");

  // Biometrics State
  const [metrics, setMetrics] = useState({ bpm: "--", temp: "--", sweat: "--" });

  // Animation Refs
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Audio Refs
  const audioCtxRef      = useRef(null);
  const nextStartTimeRef = useRef(0);
  const pulseLoopRef     = useRef(null);

  // ── ANIMATIONS ──────────────────────────────────────────────────────────────
  const startPulse = () => {
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();
  };

  const stopPulse = () => {
    pulseLoopRef.current?.stop();
    Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const animateToggle = (toValue) => {
    Animated.parallel([
      Animated.timing(glowAnim, {
        toValue, duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.92, duration: 100, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.back(3)), useNativeDriver: true }),
      ]),
    ]).start();
  };

  // ── BIOMETRICS SIMULATION ───────────────────────────────────────────────────
  useEffect(() => {
    let interval;
    if (isOn) {
      let currentBpm = 75;
      let currentTemp = 36.6;
      let currentSweat = 12;

      interval = setInterval(() => {
        currentBpm += (Math.random() - 0.5) * 4;
        currentTemp += (Math.random() - 0.5) * 0.1;
        currentSweat += (Math.random() - 0.5) * 2;

        if (currentBpm < 60) currentBpm = 60;
        if (currentBpm > 140) currentBpm = 140;
        if (currentSweat < 0) currentSweat = 0;
        
        setMetrics({
          bpm: Math.floor(currentBpm),
          temp: currentTemp.toFixed(1),
          sweat: Math.floor(currentSweat) + "%"
        });
      }, 2000);
    } else {
      setMetrics({ bpm: "--", temp: "--", sweat: "--" });
    }
    return () => clearInterval(interval);
  }, [isOn]);

  // ── SOCKET & AUDIO LIFECYCLE ────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") {
      Audio.requestPermissionsAsync();
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });
    }

    socket.on("connect",      () => console.log("Socket connected"));
    socket.on("disconnect",   () => {
      setIsOn(false);
      setStatus("READY");
      animateToggle(0);
      stopPulse();
      clearAudio();
    });
    
    // Status updates
    socket.on("musicStarted", () => { setStatus("STREAMING"); startPulse(); });
    socket.on("musicStopped", () => { setStatus("READY"); stopPulse(); clearAudio(); });
    socket.on("musicError",   (msg) => {
      console.error("Music error:", msg);
      setStatus("ERROR");
      setIsOn(false);
      animateToggle(0);
      stopPulse();
      clearAudio();
    });

    // 🎵 NEW: Listen for Active Band from Backend (Feedback Loop)
    socket.on("activeBand", (activeInstruments) => {
      console.log("Backend Active Band:", activeInstruments);
      if (Array.isArray(activeInstruments)) {
        // This will update the UI to light up the specific buttons
        setSelectedInstruments(new Set(activeInstruments));
      }
    });

    // Audio Streaming
    socket.on("audioChunk", (b64) => {
      if (Platform.OS === "web") {
        if (!audioCtxRef.current) return;
        try {
          const buf = base64ToAudioBuffer(audioCtxRef.current, b64);
          if (buf) {
            const src = audioCtxRef.current.createBufferSource();
            src.buffer = buf;
            src.connect(audioCtxRef.current.destination);
            const now = audioCtxRef.current.currentTime;
            const startAt = Math.max(now, nextStartTimeRef.current);
            src.start(startAt);
            nextStartTimeRef.current = startAt + buf.duration;
          }
        } catch (e) {
          console.warn("Web audio error:", e);
        }
      } else {
        enqueueChunk(b64);
      }
    });

    return () => {
      socket.offAll();
      socket.disconnect();
      clearAudio();
    };
  }, []);

  // ── SELECTION LOGIC ─────────────────────────────────────────────────────────
  
  // Automatically notify backend when selection changes
  // Note: If "activeBand" event updates the state, this will fire back to server.
  // This is acceptable as it keeps the "conductor" in sync with the UI.
  useEffect(() => {
    if (isOn && socket?.connected) {
      console.log("Syncing session with backend...");
      socket.emit("updateSession", {
        instruments: Array.from(selectedInstruments),
        genres: Array.from(selectedGenres),
        moods: Array.from(selectedMoods)
      });
    }
  }, [selectedInstruments, selectedGenres, selectedMoods]);

  const toggleSelection = (item, set, setter) => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setter(next);
  };

  const toggle = () => {
    if (!socket?.connected) { setStatus("ERROR"); return; }

    if (!isOn) {
      // STARTING
      if (Platform.OS === "web") {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext ?? window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        } else {
          audioCtxRef.current.resume();
        }
        nextStartTimeRef.current = 0;
      }
      setStatus("CONNECTING");
      animateToggle(1);
      setIsOn(true);
      
      // Emit start with current selections
      socket.emit("startMusic", { 
        instruments: Array.from(selectedInstruments),
        genres: Array.from(selectedGenres),
        moods: Array.from(selectedMoods)
      });
    } else {
      // STOPPING
      animateToggle(0);
      setIsOn(false);
      setStatus("READY");
      socket.emit("stopMusic");
      clearAudio();
      if (Platform.OS === "web") {
        audioCtxRef.current?.suspend();
        nextStartTimeRef.current = 0;
      }
    }
  };

  const bgColor    = glowAnim.interpolate({ inputRange: [0, 1], outputRange: ["#0a0a0f", "#050d1a"] });
  const buttonBg   = glowAnim.interpolate({ inputRange: [0, 1], outputRange: ["#1a1a2e", "#0066ff"] });
  const shadowOpac = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const statusColor = { READY: "#3a3a5c", CONNECTING: "#ffaa00", STREAMING: "#0066ff", ERROR: "#ff4444" };

  const renderChips = (data, set, setter) => (
    <View style={styles.chipContainer}>
      {data.map((item) => {
        const isSelected = set.has(item);
        return (
          <Pressable 
            key={item} 
            onPress={() => toggleSelection(item, set, setter)}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {item}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "INSTRUMENTS":
        return (
          <View>
            <Text style={styles.groupTitle}>MELODY</Text>
            {renderChips(MELODY, selectedInstruments, setSelectedInstruments)}
            <Text style={[styles.groupTitle, { marginTop: 20 }]}>HARMONY</Text>
            {renderChips(HARMONY, selectedInstruments, setSelectedInstruments)}
            <Text style={[styles.groupTitle, { marginTop: 20 }]}>BASS</Text>
            {renderChips(BASS, selectedInstruments, setSelectedInstruments)}
          </View>
        );
      case "GENRES":
        return renderChips(GENRES, selectedGenres, setSelectedGenres);
      case "MOODS":
        return renderChips(MOODS, selectedMoods, setSelectedMoods);
      default:
        return null;
    }
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.container, { backgroundColor: bgColor }]}>
      <SafeAreaView style={styles.safeArea}>
        
        {/* Settings Button */}
        <Pressable 
          style={styles.settingsButton} 
          onPress={() => setSettingsVisible(true)}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>

        {/* Main UI */}
        <View style={styles.centerContent}>
          <Text style={[styles.statusLabel, { color: statusColor[status] }]}>{status}</Text>
          <Text style={[styles.stateText, isOn ? styles.stateOn : styles.stateOff]}>
            {isOn ? "ON" : "OFF"}
          </Text>

          <View style={styles.buttonWrapper}>
            <Animated.View style={[styles.glowRing, { opacity: shadowOpac }]} />
            {isOn && status === "STREAMING" && (
              <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
            )}
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Animated.View style={[styles.buttonOuter, { backgroundColor: buttonBg }]}>
                <Pressable onPress={toggle} style={styles.buttonInner}>
                  <Text style={[styles.powerIcon, isOn ? styles.powerIconOn : null]}>⏻</Text>
                </Pressable>
              </Animated.View>
            </Animated.View>
          </View>

          {/* Biometrics Display */}
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>HR (BPM)</Text>
              <Text style={[styles.statValue, { color: '#ff3366' }]}>{metrics.bpm}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>TEMP (°C)</Text>
              <Text style={[styles.statValue, { color: '#00ccff' }]}>{metrics.temp}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>GSR (SWEAT)</Text>
              <Text style={[styles.statValue, { color: '#ccff00' }]}>{metrics.sweat}</Text>
            </View>
          </View>

        </View>

        {/* Settings Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={settingsVisible}
          onRequestClose={() => setSettingsVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              
              <View style={styles.modalHeader}>
                <View style={styles.tabsContainer}>
                  {TABS.map(tab => (
                    <Pressable 
                      key={tab} 
                      onPress={() => setActiveTab(tab)}
                      style={[styles.tab, activeTab === tab && styles.tabActive]}
                    >
                      <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                        {tab}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => setSettingsVisible(false)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </Pressable>
              </View>
              
              <ScrollView 
                style={styles.scrollArea} 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {renderContent()}
                <View style={{ height: 40 }} /> 
              </ScrollView>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%' },
  
  settingsButton: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 60,
    right: 30,
    zIndex: 10,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  settingsIcon: { fontSize: 24, color: '#5a5a8a' },

  centerContent: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 32 
  },
  statusLabel: { fontSize: 11, letterSpacing: 6, fontWeight: "700" },
  stateText: { fontSize: 64, fontWeight: "800", letterSpacing: 8 },
  stateOn:  { color: "#0066ff" },
  stateOff: { color: "#2a2a4a" },
  
  buttonWrapper: { width: 160, height: 160, alignItems: "center", justifyContent: "center" },
  glowRing: {
    position: "absolute", width: 160, height: 160, borderRadius: 80,
    backgroundColor: "#0066ff",
    shadowColor: "#0066ff", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
  },
  pulseRing: {
    position: "absolute", width: 180, height: 180, borderRadius: 90,
    borderWidth: 2, borderColor: "rgba(0,102,255,0.35)",
  },
  buttonOuter: {
    width: 140, height: 140, borderRadius: 70, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#0066ff", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 30, elevation: 20,
  },
  buttonInner: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  powerIcon:   { fontSize: 42, color: "#3a3a6a" },
  powerIconOn: { color: "#ffffff" },

  // Biometrics Display Styles
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 20,
    marginTop: 20,
    minWidth: 300
  },
  statBox: {
    alignItems: 'center',
    width: 80
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)'
  },
  statLabel: {
    fontSize: 10,
    color: '#5a5a8a',
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'], // Fixed width numbers to prevent jitter
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4
  },

  // Modal & Tabs
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    height: '75%',
    backgroundColor: '#0a0a0f',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 25,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  tab: {
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#0066ff',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#5a5a8a',
  },
  tabTextActive: {
    color: '#ffffff',
    textShadowColor: 'rgba(0,102,255,0.8)',
    textShadowRadius: 10,
  },
  closeButton: { padding: 8 },
  closeButtonText: { fontSize: 20, color: '#5a5a8a', fontWeight: 'bold' },
  
  // Content Styles
  scrollArea: { flex: 1 },
  scrollContent: { padding: 24 },
  groupTitle: {
    fontSize: 10, 
    color: "#5a5a8a", 
    fontWeight: "700", 
    letterSpacing: 2, 
    marginBottom: 12,
    marginLeft: 4
  },
  chipContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "#2a2a4a",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  chipSelected: {
    borderColor: "#0066ff",
    backgroundColor: "rgba(0,102,255,0.2)",
  },
  chipText: {
    fontSize: 13,
    color: "#6a6a8a",
    fontWeight: "500",
  },
  chipTextSelected: {
    color: "#ffffff",
    fontWeight: "600",
    textShadowColor: "rgba(0,102,255,0.5)",
    textShadowRadius: 4,
  }
});
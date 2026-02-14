import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Audio } from "expo-av";
import { socket } from "@/services/socket";
import { enqueueChunk, clearAudio } from "@/services/audioPlayer.js"; // ← new gapless engine

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;

// ── web helper ────────────────────────────────────────────────────────────────
// Web Audio API already does sample-accurate scheduling — no changes needed here.
function base64ToAudioBuffer(ctx, b64) {
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
}

// ── component ─────────────────────────────────────────────────────────────────
export default function Button() {
  const [isOn, setIsOn] = useState(false);
  const [status, setStatus] = useState("READY");

  const glowAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const audioCtxRef      = useRef(null);
  const nextStartTimeRef = useRef(0);
  const pulseLoopRef     = useRef(null);

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

    socket.on("audioChunk", (b64) => {
      if (Platform.OS === "web") {
        // Web Audio API: sample-accurate clock scheduling = no gaps natively
        if (!audioCtxRef.current) return;
        try {
          const buf = base64ToAudioBuffer(audioCtxRef.current, b64);
          const src = audioCtxRef.current.createBufferSource();
          src.buffer = buf;
          src.connect(audioCtxRef.current.destination);
          const now = audioCtxRef.current.currentTime;
          const startAt = Math.max(now, nextStartTimeRef.current);
          src.start(startAt);
          nextStartTimeRef.current = startAt + buf.duration;
        } catch (e) {
          console.warn("Web audio error:", e);
        }
      } else {
        // Native: use the gapless duration-scheduled engine
        enqueueChunk(b64);
      }
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("musicStarted");
      socket.off("musicStopped");
      socket.off("musicError");
      socket.off("audioChunk");

      socket.disconnect();
      clearAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    if (!socket?.connected) { setStatus("ERROR"); return; }

    if (!isOn) {
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
      socket.emit("startMusic");
    } else {
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

  return (
    <Animated.View style={[styles.container, { backgroundColor: bgColor }]}>
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

      <View style={styles.row}>
        <Pressable onPress={() => !isOn && toggle()} style={[styles.pill, isOn ? styles.pillActive : null]}>
          <Text style={[styles.pillText, isOn ? styles.pillTextActive : null]}>ON</Text>
        </Pressable>
        <Pressable onPress={() => isOn && toggle()} style={[styles.pill, !isOn ? styles.pillActive : null]}>
          <Text style={[styles.pillText, !isOn ? styles.pillTextActive : null]}>OFF</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 32 },
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
  row:         { flexDirection: "row", gap: 12, marginTop: 8 },
  pill: {
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 100,
    borderWidth: 1, borderColor: "#1e1e3a", backgroundColor: "transparent",
  },
  pillActive:     { borderColor: "#0066ff", backgroundColor: "rgba(0,102,255,0.1)" },
  pillText:       { fontSize: 12, fontWeight: "700", letterSpacing: 3, color: "#2a2a4a" },
  pillTextActive: { color: "#0066ff" },
});
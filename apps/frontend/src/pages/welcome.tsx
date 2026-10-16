import { ArrowRightIcon, DicesIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Avatar } from "@/components/avatar";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { motionTokens, springs } from "@/lib/motion";
import { firstName, getProfile, saveProfile } from "@/lib/profile";

const SETTING_UP_MS = 1500;
const LINES = [
  "Setting up your workspace…",
  "Warming up the simulator…",
  "Almost there…",
];

function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

function SettingUp({ name, seed }: { name: string; seed: string }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setLine((current) => Math.min(current + 1, LINES.length - 1)),
      SETTING_UP_MS / LINES.length,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <motion.div
      key="setting-up"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center text-center"
      role="status"
    >
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, y: [0, -10, 0] }}
        transition={{
          scale: springs.bouncy,
          opacity: { duration: motionTokens.duration.fast },
          y: { duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: 0.3 },
        }}
      >
        <Avatar seed={seed} className="size-28 shadow-hard" />
      </motion.div>
      <h1 className="mt-8 text-2xl font-bold tracking-tight">
        Hey {name}, welcome in.
      </h1>
      <div className="mt-2 h-6 text-muted-foreground">
        <AnimatePresence mode="wait">
          <motion.p
            key={line}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: motionTokens.duration.fast }}
          >
            {LINES[line]}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-8 h-2.5 w-64 overflow-hidden rounded-full border border-ink bg-card">
        <motion.div
          className="h-full origin-left bg-primary"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{
            duration: SETTING_UP_MS / 1000,
            ease: motionTokens.easing.smooth,
          }}
        />
      </div>
    </motion.div>
  );
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = params.has("edit");
  const [existing] = useState(getProfile);
  const [name, setName] = useState(existing?.name ?? "");
  // Follows the name until the user shuffles, then sticks.
  const [chosenSeed, setChosenSeed] = useState<string | null>(
    existing?.avatarSeed ?? null,
  );
  const [settingUp, setSettingUp] = useState(false);
  const [spin, setSpin] = useState(0);

  const trimmed = name.trim();
  const seed = chosenSeed ?? (trimmed.toLowerCase() || "AdaTwin");

  useEffect(() => {
    if (!settingUp) return;
    const timer = window.setTimeout(
      () => navigate("/workspace", { replace: true }),
      SETTING_UP_MS + 250,
    );
    return () => window.clearTimeout(timer);
  }, [settingUp, navigate]);

  if (existing && !editing && !settingUp) {
    return <Navigate to="/workspace" replace />;
  }

  function submit() {
    if (!trimmed) return;
    saveProfile({ name: trimmed, avatarSeed: seed });
    if (editing) navigate("/workspace");
    else setSettingUp(true);
  }

  return (
    <div className="flex min-h-svh flex-col">
      <TopBar />
      <main className="relative grid flex-1 place-items-center overflow-hidden px-4 py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <AnimatePresence mode="wait">
          {settingUp ? (
            <SettingUp
              key="setting-up"
              name={firstName({ name: trimmed, avatarSeed: seed })}
              seed={seed}
            />
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: motionTokens.distance.lg, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={springs.snappy}
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              className="relative w-full max-w-md rounded-[28px] border-2 border-ink bg-card p-8 text-center shadow-hard sm:p-10"
            >
              <div className="relative mx-auto mb-7 w-fit">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={seed}
                    initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.6, opacity: 0, rotate: 12 }}
                    transition={springs.bouncy}
                  >
                    <Avatar seed={seed} className="size-28" alt="Your avatar" />
                  </motion.div>
                </AnimatePresence>
                <motion.button
                  type="button"
                  aria-label="Try another avatar"
                  title="Try another avatar"
                  onClick={() => {
                    setChosenSeed(randomSeed());
                    setSpin((turns) => turns + 1);
                  }}
                  animate={{ rotate: spin * 180 }}
                  whileTap={{ scale: motionTokens.scale.press }}
                  transition={springs.snappy}
                  className="absolute -right-1 -bottom-1 grid size-10 place-items-center rounded-full border-2 border-ink bg-primary text-[#14140f] hover:shadow-hard-sm"
                >
                  <DicesIcon className="size-5" />
                </motion.button>
              </div>

              <h1 className="text-2xl font-bold tracking-tight">
                {editing ? "Edit your profile" : "What should we call you?"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {editing
                  ? "Change your name or roll a new avatar."
                  : "Just a name for now. Roll the dice for a different face."}
              </p>

              <div className="mt-7 flex flex-col gap-1.5 text-left">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  autoFocus
                  autoComplete="nickname"
                  maxLength={40}
                  placeholder="e.g. Jay"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-12 text-base"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="mt-5 w-full"
                disabled={!trimmed}
              >
                {editing ? "Save" : "Continue"} <ArrowRightIcon />
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </Button>
              )}
            </motion.form>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

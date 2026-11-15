/** Dictée vocale par l'API du navigateur. Renvoie null si le téléphone ne la propose pas. */
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
};

export function speechAvailable(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface Listening { stop(): void }

export function listen(handlers: { onFinal(text: string): void; onInterim?(text: string): void; onEnd(error?: string): void }): Listening | null {
  const w = window as unknown as Record<string, new () => Rec>;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let error = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) handlers.onFinal(r[0].transcript.trim());
      else interim += r[0].transcript;
    }
    if (interim) handlers.onInterim?.(interim);
  };
  rec.onerror = (e) => { error = e.error; };
  rec.onend = () => handlers.onEnd(error || undefined);
  try { rec.start(); } catch { return null; }
  return { stop: () => rec.stop() };
}

export function speechErrorMessage(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Micro refusé : autorise le micro pour cette appli dans les réglages du téléphone.';
  if (code === 'network') return 'La dictée du navigateur a besoin d’Internet. Hors ligne, utilise le micro du clavier.';
  if (code === 'no-speech') return 'Rien entendu. Réessaie plus près du téléphone.';
  if (code === 'aborted') return '';
  return 'Dictée interrompue. Réessaie, ou utilise le micro du clavier.';
}

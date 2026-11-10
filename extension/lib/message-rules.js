/**
 * Workana checks every chat message against these patterns before sending it
 * (copied from the rules its conversation page ships with). A match opens a
 * "System message: it looks like your message includes contact details"
 * dialog instead of sending, so an automatic message that matches never goes
 * out. Some are broad: "fee" also matches "feedback", "taxa" any "taxas".
 */
const RULES = [
  /whatsapp|skype|[0-9]{5,100}|@/i,
  /behance/i,
  /comision|comisión|taxa|fee|comissão|comissao|commission/i,
  /(https?:\/\/)?((www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{2,6})\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/i,
  /[a-z0-9_.+-]+\s*@\s*[a-z0-9_.-]+\.[a-z]{2,}|@\s*(gmail|hotmail|outlook|yahoo|icloud|proton)|(gmail|hotmail|outlook|yahoo|icloud|proton)\s*(\.|punto|ponto|dot)\s*com|\barroba\b|\bat\s+gmail\b|\bat\s+hotmail\b|\bat\s+outlook\b|\bat\s+yahoo\b|\(\s*a[t]?\s*\)|\[\s*a[t]?\s*\]/i,
  /whats\s*app|wasap|whatsaap|whatssapp|\bwpp\b|\bwsp\b|\bwhats\b|\bzap+\b|\bskype\b|\bsignal\.me\b|\bsignal\b|\bdiscord\b|discord\.gg|\binstagram\b|\binsta\b|\bzoom\b|zoom\.us|google\s*meet|\bmeet\b|meet\.google|\bwechat\b|teams\.live/i,
  /\bpaypal\b|\bpayoneer\b|mercado\s*pago|mercadopago|\bpix\b|chave\s+pix|\btransferencia\b|\bdeposito\b|western\s*union|\bbinance\b|\busdt\b|\bcripto\b|\bzelle\b|\bvenmo\b|\bwise\b|cuenta\s+bancaria|\bcbu\b|\bclabe\b|\biban\b|\bnequi\b|\bbancolombia\b|\bdaviplata\b/i,
  /\d{5,}/,
  /\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|zero|um|dois|quatro|sete|oito|nove|one|two|three|four|five|six|seven|eight|nine)\b(\s+(y|e|con|and|,)?\s*\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|zero|um|dois|quatro|sete|oito|nove|one|two|three|four|five|six|seven|eight|nine)\b){4,}/i,
  /\bllam(a|e|o|as|es|an|en|ame|adme|enme|ada|adas|amos|aron|arme|arte|arnos|arlo|arle|ar)\b|\bligar\b|\bligo\b|liga\s+novo|\bchamar\b|\bchama\b|hablamos\s+por\s+(telefono|celular|el\s+cel|el\s+numero)|hablar\s+por\s+(telefono|videollamada|cel|celular)|podemos\s+platicar\s+en\s+llamada|comunicar(nos)?\s+por\s+llamada|\bcall\s+me\b|\bring\s+me\b|talk\s+on\s+the\s+phone/i,
  /\b(tenes|tienes|tem|voce\s+tem|vc\s+tem)\s+(um\s+|algum\s+)?(whats\s*app|whats|wsp|wpp|zap|email|e-?mail|numero|telefono|celular|contato|contacto)\b|\b(pasame|pasas|me\s+pasas|me\s+das|me\s+envias|me\s+dices)\s+(tu|el|un)\s+(numero|email|contacto|whatsapp|whats|wsp|wpp|zap|telefono)\b|\bdame\s+tu\s+(email|numero|contacto|whatsapp|whats|wsp|wpp|zap|telefono)\b|\bme\s+passa\s+seu\s+(whats|wsp|wpp|zap|numero|email)\b|\bcomo\s+nos\s+(podemos\s+)?comuni|share\s+(a\s+)?(your\s+)?(resume|email|whatsapp|number|phone|contact)|(do\s+you\s+have|can\s+you\s+share)\s+(a\s+|an\s+|your\s+)?(whatsapp|email|phone|number|contact)/i,
  /fuera\s+de\s+workana|fuera\s+de\s+la\s+plataforma|fuera\s+de\s+aqui|fuera\s+de\s+aca|por\s+fuera|por\s+afuera|fora\s+do\s+workana|fora\s+da\s+plataforma|sin\s+comision|sin\s+la\s+comision|evitar\s+(la\s+)?comision|menos\s+comision|trato\s+directo|pago\s+directo|contacto\s+directo|no\s+me\s+(deja|permite)\s+(mandar|enviar|compartir|hacer|organizar)|workana\s+me\s+prohibe.{0,30}(mandar|enviar|compartir|hacer|organizar|intera|contactar)|la\s+plataforma\s+no\s+(permite|deja).{0,30}(mandar|enviar|compartir|hacer|organizar|intera|contactar)/i,
];

/** The part of `text` Workana would flag as contact details, or '' when it passes. */
export function contactFlag(text) {
  for (const rule of RULES) {
    const m = String(text || '').match(rule);
    if (m) return m[0];
  }
  return '';
}

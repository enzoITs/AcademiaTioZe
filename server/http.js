// Ajudantes das rotas: respostas JSON, leitura do corpo com limite, origem e limite de tentativas.

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

/** Envolve a rota: erros inesperados viram 500 sem vazar detalhes. */
export function route(handler) {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      console.error('[api]', err);
      return fail('Erro no servidor. Tente de novo em instantes.', 500);
    }
  };
}

/** Pedidos que mudam algo precisam vir do próprio site (o cookie já é sameSite=lax). */
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJson(request, maxBytes) {
  const text = await request.text();
  if (text.length > maxBytes) return { error: 'Dados grandes demais.' };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: 'JSON inválido.' };
  }
}

export function clientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

// Limite simples em memória (um processo no Railway basta para o jogo).
const buckets = new Map();

/** true se ainda pode; false se passou de `limit` tentativas na janela. */
export function allow(key, limit, windowSeconds) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowSeconds * 1000 });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

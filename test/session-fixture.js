// Unit handlers use the same cookie/session authority as the HTTP server.
export function sessionRequest(ctx, req) {
  const user = ctx.user(req);
  const token = 'a'.repeat(64);
  ctx.state.sessions ??= {};
  if (user) {
    ctx.state.users ??= [];
    const index = ctx.state.users.findIndex((candidate) => candidate.id === user.id);
    if (index < 0) ctx.state.users.push(user);
    else ctx.state.users[index] = user;
    ctx.state.sessions[token] = { userId: user.id, expiresAt: Date.now() + 60000 };
  } else delete ctx.state.sessions[token];
  req.headers ??= {};
  if (user) req.headers.cookie = `local_session=${token}`;
  return req;
}

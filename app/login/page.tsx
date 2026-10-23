export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="mb-1 text-2xl font-bold">Training Hub</h1>
      <p className="mb-6 text-muted">Sign in to see your training.</p>
      <form action="/api/auth/login" method="post" className="card space-y-3">
        <input className="input" type="password" name="password" placeholder="Password" autoFocus required autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        {error === "1" && <p className="text-sm text-bad">Wrong password.</p>}
        {error === "no-password" && (
          <p className="text-sm text-bad">This deployment has no APP_PASSWORD. Add it in your host&apos;s environment variables (for Production too) and redeploy.</p>
        )}
        {error === "no-secret" && (
          <p className="text-sm text-bad">This deployment has no SESSION_SECRET. Add it in your host&apos;s environment variables (for Production too) and redeploy.</p>
        )}
        <button className="btn-primary w-full">Sign in</button>
      </form>
    </div>
  );
}

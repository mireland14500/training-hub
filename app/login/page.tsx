export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="mb-1 text-2xl font-bold">Training Hub</h1>
      <p className="mb-6 text-muted">Sign in to see your training.</p>
      <form action="/api/auth/login" method="post" className="card space-y-3">
        <input className="input" type="password" name="password" placeholder="Password" autoFocus required autoComplete="current-password" />
        {error && <p className="text-sm text-bad">Wrong password.</p>}
        <button className="btn-primary w-full">Sign in</button>
      </form>
    </div>
  );
}

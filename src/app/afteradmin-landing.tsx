function IconChecklist() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 5.5 1.25 1.25L7 4.5" />
      <path d="m3.5 11.5 1.25 1.25L7 10.5" />
      <path d="m3.5 17.5 1.25 1.25L7 16.5" />
    </svg>
  );
}

function IconInstructions() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <path d="M6 3.5h9l3.5 3.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14.5 3.5V7h3.5" />
      <path d="M8.5 12h7M8.5 15.5h7M8.5 18h4" />
    </svg>
  );
}

function IconLetter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  );
}

function IconStatus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.25 2.25L15.5 9.5" />
    </svg>
  );
}

function IconVault() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <rect x="3.5" y="10" width="17" height="10.5" rx="2" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
      <circle cx="12" cy="15" r="1.75" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <circle cx="17" cy="7.5" r="2.25" />
      <path d="M15.5 14.3c2.4.3 4 2.2 4 5.2" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-5 w-5">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

const features = [
  {
    icon: IconChecklist,
    title: "Guided checklist",
    body: "A pre-populated inventory of banks, social platforms, subscriptions, and crypto exchanges to close or notify — built from a real platform database, not a blank page.",
  },
  {
    icon: IconInstructions,
    title: "Closure instructions",
    body: "Step-by-step instructions for each platform, instead of hunting through help centers to find out what a company actually requires.",
  },
  {
    icon: IconLetter,
    title: "Notification letters",
    body: "Auto-filled, formal letters for each platform — edit, send by email, download, or copy to paste wherever it's needed.",
  },
  {
    icon: IconStatus,
    title: "Status tracking",
    body: "See what's closed, what's waiting on a document, and what still needs to be started — at a glance, across every account.",
  },
  {
    icon: IconVault,
    title: "Secure credential vault",
    body: "Store the passwords and account details closure actually requires, encrypted client-side — nobody at AfterAdmin can ever read them.",
  },
  {
    icon: IconUsers,
    title: "Executor verification",
    body: "Add the people helping you close accounts, with identity verification so companies — and you — know who's actually authorized to act.",
  },
];

const steps = [
  {
    title: "Add the accounts",
    body: "Search the platform catalog or add your own. Each one arrives with its own closure method already mapped out.",
  },
  {
    title: "Get the letters",
    body: "Formal notification letters, auto-filled from what you've entered — review, edit if needed, and send.",
  },
  {
    title: "Track it to done",
    body: "Every account moves through a clear status — pending, in progress, closed — so nothing quietly falls through the cracks.",
  },
];

/** AfterAdmin.co — urgent, task-focused account-closure register (Two-Brand Foundation). */
export function AfterAdminLandingPage() {
  return (
    <div className="bg-cream text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl font-medium tracking-tight">AfterAdmin</span>
        <nav className="hidden items-center gap-8 text-sm text-ink-soft sm:flex">
          <a href="#how-it-works" className="hover:text-ink">
            How it works
          </a>
          <a href="#security" className="hover:text-ink">
            Security
          </a>
        </nav>
        <div className="flex items-center gap-4">
          <a href="/login" className="text-sm text-ink-soft hover:text-ink">
            Log in
          </a>
          <a
            href="/signup"
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark"
          >
            Get started
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-4 text-sm font-medium tracking-wide text-accent uppercase">
              Digital account closure, done right
            </p>
            <h1 className="font-display text-4xl leading-tight font-medium text-balance sm:text-5xl">
              Close their accounts, without doing it alone.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-soft">
              AfterAdmin gives you a guided checklist of every account to close or notify, formal
              letters already drafted for each one, and a clear place to track what&apos;s done — so
              you&apos;re not guessing which of a hundred logins still needs handling.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="/signup"
                className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-dark"
              >
                Start closing accounts
              </a>
              <a
                href="/login"
                className="rounded-full border border-ink/15 px-6 py-3 text-sm font-medium text-ink transition hover:border-ink/30"
              >
                Log in
              </a>
            </div>
            <p className="mt-4 text-sm text-ink-soft">Add your first account in a couple of minutes.</p>
          </div>

          <div className="rounded-3xl border border-ink/10 bg-white/70 p-6 shadow-xl shadow-ink/5 backdrop-blur-sm">
            <p className="mb-4 text-xs font-medium tracking-wide text-ink-soft uppercase">Your closure checklist</p>
            <ul className="flex flex-col gap-3 text-sm">
              {[
                { label: "Banks & financial accounts", done: true },
                { label: "Email & social platforms", done: true },
                { label: "Subscriptions & memberships", done: false },
                { label: "Crypto & digital assets", done: false },
              ].map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-3 rounded-xl border border-ink/10 bg-cream px-4 py-3"
                >
                  <span
                    className={
                      item.done
                        ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white"
                        : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink/20 text-transparent"
                    }
                  >
                    <IconCheck />
                  </span>
                  <span className={item.done ? "text-ink-soft line-through" : ""}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-2xl font-medium sm:text-3xl">Everything closure work actually requires</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="rounded-2xl border border-ink/10 bg-white/60 p-6">
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent-dark">
                  <Icon />
                </span>
                <h3 className="font-medium">{feature.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{feature.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="security" className="bg-ink-soft/[0.04] py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="font-display text-2xl font-medium sm:text-3xl">Handling someone else&apos;s accounts is sensitive. We built for that.</h2>
          <div className="mt-8 flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-accent-dark">Zero-knowledge, by design</h3>
              <p className="mt-2 text-ink-soft">
                Anything you store in the vault is encrypted before it ever leaves your device. AfterAdmin
                itself can&apos;t read what&apos;s inside — only the people you explicitly name, and only
                once you say so, can unlock it.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-accent-dark">Verified, not just invited</h3>
              <p className="mt-2 text-ink-soft">
                Anyone you add as an executor goes through identity verification before they can access
                anything sensitive — a real gate, not a formality, matched to how much is actually at
                stake.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="font-display text-2xl font-medium sm:text-3xl">How it works</h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="font-display text-3xl font-medium text-balance sm:text-4xl">
          Most of this is faster than it looks. Start today.
        </h2>
        <a
          href="/signup"
          className="mt-8 inline-block rounded-full bg-accent px-8 py-3 text-sm font-medium text-white transition hover:bg-accent-dark"
        >
          Create your account
        </a>
      </section>

      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="font-display text-lg font-medium">AfterAdmin</span>
            <p className="mt-2 max-w-xs text-sm text-ink-soft">Close a loved one&apos;s accounts, this week.</p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-ink-soft sm:flex-row sm:gap-8">
            <a href="/login" className="hover:text-ink">
              Log in
            </a>
            <a href="/signup" className="hover:text-ink">
              Sign up
            </a>
            <a href="#how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="#security" className="hover:text-ink">
              Security
            </a>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-10 text-xs text-ink-soft/80">
          <p>AfterAdmin does not provide legal, financial, or tax advice.</p>
          <p className="mt-1">&copy; {new Date().getFullYear()} AfterAdmin.</p>
        </div>
      </footer>
    </div>
  );
}

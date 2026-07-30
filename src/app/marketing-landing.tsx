function IconVault() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <rect x="3.5" y="10" width="17" height="10.5" rx="2" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
      <circle cx="12" cy="15" r="1.75" />
    </svg>
  );
}

function IconCheckIn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3M16 3v3" />
      <path d="M8.5 14.5l2.25 2.25L15.5 12" />
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

function IconWill() {
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

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" stroke="currentColor" className="h-5 w-5">
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3" />
    </svg>
  );
}

const features = [
  {
    icon: IconVault,
    title: "Your vault",
    body: "Store account credentials, financial details, and personal instructions with end-to-end encryption. Even AfterVault can't read what's inside.",
  },
  {
    icon: IconCheckIn,
    title: "Occasional check-ins",
    body: "A low-effort check-in now and then confirms you're okay. If enough are missed, the people you've named can begin the activation process.",
  },
  {
    icon: IconUsers,
    title: "Guided, limited access",
    body: "When it's time, the person you named gets a clear, read-only view of what they need — not a login to your entire life.",
  },
  {
    icon: IconWill,
    title: "Will Builder",
    body: "Draft a will covering your executor, guardians for minor children, bequests, and a residuary clause — plus the witnessing rules for your jurisdiction.",
  },
  {
    icon: IconLetter,
    title: "Notification letters",
    body: "Auto-drafted letters to banks, subscriptions, and platforms, ready for your executor to review, edit, and send.",
  },
  {
    icon: IconChecklist,
    title: "Beneficiaries & closure",
    body: "Track who inherits what, and follow every account through to closed — memorialized, transferred, or shut down for good.",
  },
];

const steps = [
  {
    title: "Set up your vault",
    body: "Add your accounts, assets, and any instructions you want followed. Takes about ten minutes to cover the basics.",
  },
  {
    title: "Name your people",
    body: "Invite family members or an executor, and decide exactly what each of them can see, and when.",
  },
  {
    title: "Check in, occasionally",
    body: "A few clicks every so often is all we ask. Life goes on — AfterVault just waits quietly in the background.",
  },
  {
    title: "We take it from there",
    body: "If check-ins stop, your named people are walked through activation and access, one guided step at a time.",
  },
];

export function MarketingLandingPage() {
  return (
    <div className="bg-cream text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl font-medium tracking-tight">AfterVault</span>
        <nav className="hidden items-center gap-8 text-sm text-ink-soft sm:flex">
          <a href="#how-it-works" className="hover:text-ink">
            How it works
          </a>
          <a href="#security" className="hover:text-ink">
            Security
          </a>
          <a href="#will-builder" className="hover:text-ink">
            Will Builder
          </a>
        </nav>
        <div className="flex items-center gap-4">
          <a href="/login" className="text-sm text-ink-soft hover:text-ink">
            Log in
          </a>
          <a
            href="/signup"
            className="rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember-dark"
          >
            Get started
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-ember/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-40 -left-32 h-80 w-80 rounded-full bg-sage/20 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-4 text-sm font-medium tracking-wide text-sage-dark uppercase">
              Digital estate planning, done gently
            </p>
            <h1 className="font-display text-4xl leading-tight font-medium text-balance sm:text-5xl">
              Everything you&apos;d want someone to find. Nothing they&apos;d have to guess.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-soft">
              AfterVault is a secure home for your accounts, your wishes, and your will — so the people
              you trust aren&apos;t left piecing it together during the hardest weeks of their lives.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="/signup"
                className="rounded-full bg-ember px-6 py-3 text-sm font-medium text-white transition hover:bg-ember-dark"
              >
                Start your vault
              </a>
              <a
                href="/login"
                className="rounded-full border border-ink/15 px-6 py-3 text-sm font-medium text-ink transition hover:border-ink/30"
              >
                Log in
              </a>
            </div>
            <p className="mt-4 text-sm text-ink-soft">Takes about ten minutes to set up the basics.</p>
          </div>

          <div className="rounded-3xl border border-ink/10 bg-white/70 p-6 shadow-xl shadow-ink/5 backdrop-blur-sm">
            <p className="mb-4 text-xs font-medium tracking-wide text-ink-soft uppercase">Inside your vault</p>
            <ul className="flex flex-col gap-3 text-sm">
              {[
                "Passwords & accounts",
                "Your will & wishes",
                "Named beneficiaries",
                "Notes for your executor",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-xl border border-ink/10 bg-cream px-4 py-3"
                >
                  <span className="text-sage-dark">
                    <IconLock />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="font-display text-2xl font-medium sm:text-3xl">
          When someone dies, the people who loved them get handed two jobs at once.
        </h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/60 p-6">
            <p className="mb-3 text-sm font-medium text-ink-soft uppercase">What grief asks of them</p>
            <ul className="flex flex-col gap-2 text-ink-soft">
              <li>Sit with the loss</li>
              <li>Tell the people who need to know</li>
              <li>Grieve, at their own pace</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-white/60 p-6">
            <p className="mb-3 text-sm font-medium text-ink-soft uppercase">What logistics asks of them</p>
            <ul className="flex flex-col gap-2 text-ink-soft">
              <li>Find every account and subscription</li>
              <li>Prove who they are to a dozen companies</li>
              <li>Track down a will, and guess at passwords</li>
            </ul>
          </div>
        </div>
        <p className="mt-8 text-lg text-ink-soft">
          AfterVault exists so the second list doesn&apos;t make the first one harder.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-2xl font-medium sm:text-3xl">How AfterVault helps</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="rounded-2xl border border-ink/10 bg-white/60 p-6">
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-ember/10 text-ember-dark">
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
          <h2 className="font-display text-2xl font-medium sm:text-3xl">Built for the after, not just the before.</h2>
          <div className="mt-8 flex flex-col gap-6">
            <div>
              <h3 className="font-medium text-sage-dark">Zero-knowledge, by design</h3>
              <p className="mt-2 text-ink-soft">
                Your vault is encrypted before it ever leaves your device. AfterVault itself can&apos;t
                read what&apos;s inside. Only the people you explicitly name — and only once your case is
                activated — can unlock it.
              </p>
            </div>
            <div id="will-builder">
              <h3 className="font-medium text-sage-dark">An honest Will Builder</h3>
              <p className="mt-2 text-ink-soft">
                A will you draft here becomes valid once it&apos;s signed the way your jurisdiction
                requires — witnesses, notarization, or both. We show you exactly what that involves,
                every step. AfterVault is not a law firm and doesn&apos;t provide legal, financial, or tax
                advice — for anything your situation calls for, we&apos;ll point you to review it with one.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="font-display text-2xl font-medium sm:text-3xl">How it works</h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember text-sm text-white">
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
          There&apos;s no better time to put this in place than while you still can.
        </h2>
        <a
          href="/signup"
          className="mt-8 inline-block rounded-full bg-ember px-8 py-3 text-sm font-medium text-white transition hover:bg-ember-dark"
        >
          Create your account
        </a>
      </section>

      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="font-display text-lg font-medium">AfterVault</span>
            <p className="mt-2 max-w-xs text-sm text-ink-soft">A quiet place to put your affairs in order.</p>
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
          <p>AfterVault is not a law firm and does not provide legal, financial, or tax advice.</p>
          <p className="mt-1">&copy; {new Date().getFullYear()} AfterVault.</p>
        </div>
      </footer>
    </div>
  );
}

import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';
import Drive from './ui/Drive';

export default function HomePage() {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Drive Clone</h1>
        <div>
          <SignedOut>
            <SignInButton />
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </header>

      <div style={{ marginTop: 24 }}>
        <SignedOut>
          <p>You are signed out. Click “Sign in” to continue.</p>
        </SignedOut>
        <SignedIn>
          <Drive />
        </SignedIn>
      </div>
    </div>
  );
}

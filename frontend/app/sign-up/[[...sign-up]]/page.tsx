import { SignUp } from '@clerk/nextjs';

export default function Page() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <SignUp />
    </div>
  );
}

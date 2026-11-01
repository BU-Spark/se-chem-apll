import { SignIn } from '@clerk/nextjs';
import AuthScreen from '@/app/components/AuthScreen/AuthScreen';
import { clerkAppearance } from '@/app/components/AuthScreen/clerkAppearance';

export default function SignInPage() {
  return (
    <AuthScreen>
      <SignIn appearance={clerkAppearance} />
    </AuthScreen>
  );
}

import { SignUp } from '@clerk/nextjs';
import AuthScreen from '@/app/components/AuthScreen/AuthScreen';
import { clerkAppearance } from '@/app/components/AuthScreen/clerkAppearance';

export default function SignUpPage() {
  return (
    <AuthScreen>
      <SignUp appearance={clerkAppearance} />
    </AuthScreen>
  );
}

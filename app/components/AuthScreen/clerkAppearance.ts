// Restyles Clerk's <SignIn> and <SignUp> to the APLL design. Only looks change;
// Clerk still provides every field and the whole sign-in / sign-up flow.
// `elements` use the shared --apll-* tokens from globals.css. `variables` must stay
// literal colors because Clerk computes shades from them; keep them in sync with the tokens.
export const clerkAppearance = {
  variables: {
    // Black links and focus rings for contrast; the Continue button sets its own teal below.
    colorPrimary: '#000000',
    colorBackground: '#f1e8da',
    colorInputBackground: '#fffcf6',
    colorText: '#000000',
    colorTextSecondary: '#000000',
    // Black on the teal Continue button passes WCAG contrast; white does not.
    colorTextOnPrimaryBackground: '#000000',
    fontFamily: 'inherit',
    borderRadius: '0.5rem',
  },
  elements: {
    cardBox: { boxShadow: 'none', borderRadius: '1.25rem', width: '24rem', maxWidth: '100%' },
    card: { background: 'var(--apll-sand)', boxShadow: 'none', border: 'none', padding: '2rem 2.25rem' },
    logoBox: { display: 'none' },
    headerTitle: { fontSize: '1rem', fontWeight: 600 },
    headerSubtitle: { display: 'none' },
    formFieldLabel: { fontSize: '0.9rem', fontWeight: 400 },
    socialButtonsBlockButton: { background: '#ffffff', '&:hover': { background: '#ffffff' } },
    socialButtonsBlockButtonText: { color: 'var(--apll-text)' },
    // !important: Clerk's own input and button shadows otherwise win over these.
    formFieldInput: { background: 'var(--apll-cream)', border: 'none', boxShadow: 'none !important' },
    formButtonPrimary: {
      background: 'var(--apll-teal)',
      boxShadow: 'none !important',
      '&::after': { display: 'none' },
      width: 'auto',
      alignSelf: 'center',
      padding: '0.6rem 1.25rem',
      fontSize: '0.95rem',
      textTransform: 'none',
      '&:hover': { background: 'var(--apll-teal-hover)' },
    },
    footer: { background: 'var(--apll-sand)' },
    footerActionLink: { color: 'var(--apll-text)', textDecoration: 'underline', fontWeight: 600 },
  },
};

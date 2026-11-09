/**
 * An email address that wraps at the @ when it must, never inside a word.
 * (break-all split "example.com" mid-word on narrow columns.)
 */
export function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf('@');
  return (
    <span className="font-medium [overflow-wrap:anywhere] text-foreground">
      {at > 0 ? (
        <>
          {email.slice(0, at)}
          <wbr />
          {email.slice(at)}
        </>
      ) : (
        email
      )}
    </span>
  );
}

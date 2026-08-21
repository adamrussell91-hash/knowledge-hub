/**
 * Wire the locked passphrase gate so Enter and the Sign in button both submit.
 * Call once after snippets/sign-in.html is in the DOM.
 *
 * Do not bind only to button click. Do not use onsubmit="return false".
 *
 * @param {ParentNode} root
 * @param {(passphrase: string) => void | Promise<void>} onPassphrase
 */
export function wireSignIn(root, onPassphrase) {
  const form = root.querySelector("form.sign-in__card");
  if (!form || form.dataset.signInWired === "true") return;
  form.dataset.signInWired = "true";
  form.setAttribute("novalidate", "");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("#sign-in-passphrase");
    void onPassphrase(input?.value ?? "");
  });

  const input = form.querySelector("#sign-in-passphrase");
  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

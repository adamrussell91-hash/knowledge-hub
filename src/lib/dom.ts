export const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

export function showToast(message: string) {
  let toast = document.querySelector<HTMLDivElement>(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout((toast as HTMLDivElement & { _timer?: number })._timer);
  (toast as HTMLDivElement & { _timer?: number })._timer = window.setTimeout(() => {
    toast?.classList.remove("is-visible");
  }, 3200);
}

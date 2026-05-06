import { useEffect } from "react";

const LoanApplicationPublic = () => {
  useEffect(() => {
    document.title = "Заявка на займ";
    const existing = document.querySelector('script[data-loan-widget]');
    if (existing) {
      (existing as HTMLScriptElement).remove();
    }
    const s = document.createElement("script");
    s.src = "/loan-widget.js?v=" + Date.now();
    s.async = true;
    s.setAttribute("data-loan-widget", "1");
    document.body.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div id="loan-widget" />
    </div>
  );
};

export default LoanApplicationPublic;

/** Small signature: "By: Visual_rgpeace". */
export function Byline({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-2.5 pr-3.5 text-xs shadow-sm ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-black" aria-hidden />
      <span className="text-slate-500">By:</span>
      <span className="font-semibold tracking-wide text-black">Visual_rgpeace</span>
    </span>
  );
}

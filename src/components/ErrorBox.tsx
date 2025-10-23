export default function ErrorBox({ msg }: { msg: string }) {
  return <div className="mt-2 p-2 rounded bg-red-600/15 text-red-300 text-sm border border-red-800/40">{msg}</div>;
}

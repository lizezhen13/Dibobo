import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Skeleton } from "../../components/ui/skeleton";
import { useSessionQuery } from "./queries";

function AuthLoading() {
  return (
    <div className="grid min-h-screen grid-cols-[248px_1fr] bg-paper">
      <aside className="bg-ink p-7">
        <Skeleton className="h-8 w-28 bg-paper/12" />
      </aside>
      <main className="p-10">
        <Skeleton className="h-9 w-48" />
        <div className="mt-12 grid grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64" />
          ))}
        </div>
      </main>
    </div>
  );
}

export function AuthGuard() {
  const session = useSessionQuery();
  const location = useLocation();

  if (session.isPending) return <AuthLoading />;
  if (session.isError || !session.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function GuestGuard() {
  const session = useSessionQuery();
  if (session.isPending) return <AuthLoading />;
  if (session.data) return <Navigate to="/overview" replace />;
  return <Outlet />;
}


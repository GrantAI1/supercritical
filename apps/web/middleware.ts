import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const IS_PUBLIC_ROUTE = createRouteMatcher([
    "/",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
    if (!IS_PUBLIC_ROUTE(req)) {
        await auth.protect();
    }
});

export const config = {
    matcher: [
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        "/(api|trpc)(.*)",
    ],
};

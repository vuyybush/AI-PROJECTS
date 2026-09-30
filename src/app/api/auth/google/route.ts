// Replaces the optional Google route from the previous update. No OAuth is started.
export async function POST() {
  return Response.json({error:{code:"EMAIL_ONLY",message:"Please sign in with your email and password."}},
    {status:410,headers:{"Cache-Control":"no-store"}});
}

import { supabase } from "../lib/supabase.js";

export async function requireAdmin(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authentication required.",
      });
    }

    const token = authorization.substring(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Authentication token missing.",
      });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("Admin auth user error:", userError);

      return res.status(401).json({
        success: false,
        error: "Invalid or expired authentication token.",
      });
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
      console.error("Admin profile lookup error:", profileError);

      return res.status(500).json({
        success: false,
        error: "Unable to verify administrator permissions.",
      });
    }

    if (profile?.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Administrator permissions required.",
      });
    }

    req.user = user;
    req.profile = profile;

    next();
  } catch (error) {
    console.error("Admin authentication error:", error);

    return res.status(500).json({
      success: false,
      error: "Authentication verification failed.",
    });
  }
}

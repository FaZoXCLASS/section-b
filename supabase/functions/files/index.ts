// ==============================================================================
// GÉNIE CIVIL SECTION B — SUPABASE EDGE FUNCTION: files
// ==============================================================================
// Handles secure student & admin file operations:
// 1. sign_upload  — Generates signed upload URLs with unguessable storage paths
//                   after checking member active status and quota limits (<= 95%).
// 2. delete_post   — Verifies author ownership (or admin status), deletes files
//                   from Storage, then deletes the database post record.
// 3. cancel_upload — Cleans up uploaded files if post creation failed (no orphans).
// ==============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// SHA-256 hash calculation using Web Crypto API
async function hashDeviceToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token.trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface AuthResult {
  isAdmin: boolean;
  memberId: string | null;
  pseudo: string | null;
  error?: string;
}

// Authenticates either an admin JWT or an active student device token
async function authenticateCaller(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  token?: string
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  // 1. Check for Admin JWT
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (jwt && jwt !== anonKey) {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
        if (!userError && user) {
          const { data: adminRecord } = await supabase
            .from("admins")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();

          if (adminRecord) {
            return { isAdmin: true, memberId: null, pseudo: "Admin" };
          }
        }
      } catch {
        // Fall back to student token inspection
      }
    }
  }

  // 2. Check for Student Device Token
  if (!token || typeof token !== "string" || token.trim().length < 16) {
    return {
      isAdmin: false,
      memberId: null,
      pseudo: null,
      error: "Jeton d'appareil manquant ou invalide.",
    };
  }

  const tokenHash = await hashDeviceToken(token);
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, status, pseudo")
    .eq("device_token_hash", tokenHash)
    .maybeSingle();

  if (memberError || !member) {
    return {
      isAdmin: false,
      memberId: null,
      pseudo: null,
      error: "Appareil non reconnu. Veuillez d'abord soumettre une demande d'accès.",
    };
  }

  if (member.status !== "active") {
    return {
      isAdmin: false,
      memberId: null,
      pseudo: null,
      error: `Votre statut actuel est "${member.status}". Seuls les membres actifs peuvent effectuer cette action.`,
    };
  }

  return { isAdmin: false, memberId: member.id, pseudo: member.pseudo };
}

function sanitizeExtension(filename: string, mime: string): string {
  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
  const rawExt = extMatch ? extMatch[1].toLowerCase() : "";

  if (mime === "application/pdf" || rawExt === "pdf") return "pdf";
  if (mime === "image/jpeg" || rawExt === "jpg" || rawExt === "jpeg") return "jpg";
  if (mime === "image/png" || rawExt === "png") return "png";
  if (mime === "image/webp" || rawExt === "webp") return "webp";

  return "bin";
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse({ error: "Configuration serveur incomplète (URL ou Clé manquante)." }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();
    const { action, token } = body;

    if (!action) {
      return jsonResponse({ error: "Action obligatoire." }, 400);
    }

    const auth = await authenticateCaller(supabase, req, token);
    if (auth.error) {
      return jsonResponse({ error: auth.error }, 403);
    }

    // =========================================================================
    // ACTION 1: SIGN UPLOAD
    // =========================================================================
    if (action === "sign_upload") {
      const { files } = body;

      if (!Array.isArray(files) || files.length === 0) {
        return jsonResponse({ error: "Aucun fichier à téléverser." }, 400);
      }

      // Check max files limit from settings
      const { data: maxSetting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "max_files_per_post")
        .maybeSingle();

      const maxFiles = maxSetting ? parseInt(maxSetting.value, 10) : 30;
      if (files.length > maxFiles) {
        return jsonResponse({ error: `Nombre maximal de fichiers dépassé (max ${maxFiles}).` }, 400);
      }

      // Check storage quota (reject when >= 95% full)
      const { data: stats } = await supabase.rpc("get_storage_stats");
      if (stats && stats.usage_percent >= 95) {
        return jsonResponse({
          error: "L'espace de stockage de la section est presque plein (≥ 95 %). Impossible d'ajouter de nouveaux fichiers. Contacte l'administrateur.",
        }, 400);
      }

      const allowedMimes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      const signedFiles = [];
      const uploadOwnerId = auth.isAdmin ? "admin" : (auth.memberId || "unknown");

      for (const file of files) {
        const mime = (file.mime || "").toLowerCase();
        const kind = file.kind === "pdf" || mime === "application/pdf" ? "pdf" : "image";

        if (!allowedMimes.includes(mime)) {
          return jsonResponse({
            error: `Format de fichier non autorisé : ${file.name || "fichier"} (${mime}). Seuls les images JPG, PNG, WebP et PDF sont acceptés.`,
          }, 400);
        }

        const ext = sanitizeExtension(file.name || "", mime);
        const fileId = crypto.randomUUID();
        const storagePath = `posts/${uploadOwnerId}/${fileId}.${ext}`;

        // Create signed upload URL for primary file (expires in 15 mins)
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("class-files")
          .createSignedUploadUrl(storagePath);

        if (uploadErr || !uploadData) {
          return jsonResponse({ error: `Erreur d'autorisation de téléversement : ${uploadErr?.message}` }, 500);
        }

        let thumbPath: string | null = null;
        let thumbUploadUrl: string | null = null;

        // If it's an image and has a companion thumbnail
        if (kind === "image" && file.hasThumb) {
          thumbPath = `thumbs/${uploadOwnerId}/${fileId}.webp`;
          const { data: thumbData, error: thumbErr } = await supabase.storage
            .from("class-files")
            .createSignedUploadUrl(thumbPath);

          if (!thumbErr && thumbData) {
            thumbUploadUrl = thumbData.signedUrl;
          }
        }

        signedFiles.push({
          id: fileId,
          originalName: file.name || "fichier",
          kind,
          mime,
          sizeBytes: file.size || 0,
          storagePath,
          uploadUrl: uploadData.signedUrl,
          thumbPath,
          thumbUploadUrl,
        });
      }

      return jsonResponse({ signedFiles });
    }

    // =========================================================================
    // ACTION 2: DELETE POST
    // =========================================================================
    if (action === "delete_post") {
      const { postId } = body;
      if (!postId) {
        return jsonResponse({ error: "Identifiant de la publication manquant." }, 400);
      }

      // 1. Fetch post to verify ownership
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .select("id, member_id")
        .eq("id", postId)
        .maybeSingle();

      if (postErr || !post) {
        return jsonResponse({ error: "Publication introuvable." }, 404);
      }

      if (!auth.isAdmin && post.member_id !== auth.memberId) {
        return jsonResponse({ error: "Vous n'êtes pas autorisé à supprimer cette publication." }, 403);
      }

      // 2. Fetch all associated files to purge from storage
      const { data: postFiles } = await supabase
        .from("post_files")
        .select("storage_path, thumb_path")
        .eq("post_id", postId);

      const pathsToDelete: string[] = [];
      for (const pf of postFiles || []) {
        if (pf.storage_path) pathsToDelete.push(pf.storage_path);
        if (pf.thumb_path) pathsToDelete.push(pf.thumb_path);
      }

      // 3. Delete files from storage
      if (pathsToDelete.length > 0) {
        await supabase.storage.from("class-files").remove(pathsToDelete);
      }

      // 4. Delete post row (cascades to post_files)
      const { error: delErr } = await supabase.from("posts").delete().eq("id", postId);
      if (delErr) {
        return jsonResponse({ error: `Erreur lors de la suppression de la publication : ${delErr.message}` }, 500);
      }

      return jsonResponse({
        success: true,
        message: "Publication et fichiers supprimés avec succès.",
        deletedFilesCount: pathsToDelete.length,
      });
    }

    // =========================================================================
    // ACTION 3: CANCEL UPLOAD (CLEANUP ORPHANS)
    // =========================================================================
    if (action === "cancel_upload") {
      const { paths } = body;
      if (!Array.isArray(paths) || paths.length === 0) {
        return jsonResponse({ success: true, message: "Aucun fichier à annuler." });
      }

      // Filter paths to ensure non-admin users can only delete their own paths
      const safePaths: string[] = [];
      const userPrefixPost = `posts/${auth.memberId}/`;
      const userPrefixThumb = `thumbs/${auth.memberId}/`;

      for (const p of paths) {
        if (typeof p === "string") {
          if (auth.isAdmin || p.startsWith(userPrefixPost) || p.startsWith(userPrefixThumb)) {
            safePaths.push(p);
          }
        }
      }

      if (safePaths.length > 0) {
        await supabase.storage.from("class-files").remove(safePaths);
      }

      return jsonResponse({ success: true, purgedCount: safePaths.length });
    }

    return jsonResponse({ error: `Action inconnue : "${action}"` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    return jsonResponse({ error: `Erreur serveur : ${message}` }, 500);
  }
});

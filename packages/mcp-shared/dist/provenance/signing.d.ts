/**
 * Ed25519 citation signing — the attestation layer (L2) over the reproducible
 * hash (L0) and replay/drift (L1) primitives in `./provenance`.
 *
 * WHY THIS EXISTS. A `result_hash` proves "these bytes hash to H". It does NOT
 * prove the SERVER vouched for them: an agent — or a compromised transport —
 * can present fabricated bytes together with a matching self-computed hash, and
 * a naive re-hash check passes. In an agent pipeline the hash travels alongside
 * the data, so the two are coupled and forgeable together. A signature breaks
 * that coupling: it binds { server, tool, query_hash, result_hash, time } to a
 * private key held ONLY by the issuing server, verifiable OFFLINE against the
 * server's published public key. Only a signed citation is honestly
 * "attested / tamper-evident"; an unsigned one is merely "reproducible".
 *
 * Uses WebCrypto Ed25519 (present in workerd and Node >= 20) — no dependency.
 * Signing is OPT-IN per server: it happens only when a {@link CitationSigner}
 * (an imported private key) is supplied, so every existing unsigned path is
 * unchanged.
 *
 * Rollout (deliberately NOT automatic — minting a signing key and provisioning
 * it as a Worker secret is a credential operation):
 *   1. `scripts/provenance/gen-citation-key.mjs` → prints a private + public JWK.
 *   2. `wrangler secret put CITATION_SIGNING_KEY` (the private JWK) per server.
 *   3. Serve the public JWK at `/.well-known/jwks.json` via {@link buildJwks}.
 *   4. Pass a {@link CitationSigner} into the citation-building path.
 */
import type { Citation } from "./provenance";
export declare const CITATION_SIG_ALG: "Ed25519";
/** A private-key handle for signing citations. */
export interface CitationSigner {
    /** Key id published in the server's JWKS as `kid`. */
    keyId: string;
    /** Imported Ed25519 private CryptoKey (usages: ["sign"]). */
    privateKey: CryptoKey;
}
/** Verdict from checking a citation's signature. */
export interface SignatureVerdict {
    verified: boolean;
    /** Present whenever a signature block existed. */
    key_id?: string;
    /**
     * Why verification did not pass. Absent when `verified` is true.
     * - "unsigned": no signature present (reproducible, not attested)
     * - "bad-signature": crypto rejected it — tampered payload or wrong key
     * - "malformed": the signature block or public key was unusable
     */
    reason?: "unsigned" | "bad-signature" | "malformed";
}
/** Minimal JWK shape we read/emit (subset of RFC 7517 / RFC 8037 OKP). */
export interface CitationJwk {
    kty?: string;
    crv?: string;
    x?: string;
    d?: string;
    kid?: string;
    use?: string;
    alg?: string;
    key_ops?: string[];
}
/** A JSON Web Key Set, as served at `/.well-known/jwks.json`. */
export interface Jwks {
    keys: CitationJwk[];
}
/**
 * The canonical byte string that gets signed. Covers exactly the
 * attestation-critical fields — WHO issued it (`server`), WHICH tool, WHEN,
 * WHAT was asked (`query_hash`), WHAT came back (`result_hash`), and the
 * negative-result status. Deliberately excludes `text` (a human convenience)
 * and `data_access_id` (an ephemeral per-session handle). Versioned so a future
 * field-set change is detectable rather than silently incompatible.
 */
export declare function citationSigningInput(citation: Citation, signedAt: string): string;
/**
 * Attach an Ed25519 signature to a citation. Returns a NEW citation with
 * `signature` set; the input is not mutated. `signedAt` is caller-supplied
 * (DO/Worker: `new Date().toISOString()`), and is itself part of the signed
 * payload so it cannot be altered after the fact.
 */
export declare function signCitation(citation: Citation, signer: CitationSigner, signedAt: string): Promise<Citation>;
/**
 * Verify a citation's embedded signature against a public key. The caller is
 * responsible for obtaining that key from the issuing server's published JWKS
 * (matching `signature.key_id`) — this function only performs the crypto, which
 * is what makes it usable offline by any consumer.
 */
export declare function verifyCitationSignature(citation: Citation, publicKey: CryptoKey): Promise<SignatureVerdict>;
/** Generate a fresh extractable Ed25519 keypair. */
export declare function generateCitationKeypair(): Promise<CryptoKeyPair>;
/** Import a private JWK (must contain `d`) for signing. */
export declare function importCitationPrivateKey(jwk: CitationJwk): Promise<CryptoKey>;
/** Import a public JWK for verification. */
export declare function importCitationPublicKey(jwk: CitationJwk): Promise<CryptoKey>;
/** Export a public key as a JWKS-ready JWK, stamped with `kid`. */
export declare function exportCitationPublicJwk(publicKey: CryptoKey, keyId: string): Promise<CitationJwk>;
/** Wrap one or more public JWKs into a JWKS document. */
export declare function buildJwks(publicJwks: CitationJwk[]): Jwks;
//# sourceMappingURL=signing.d.ts.map
BEGIN;
-- Expand original placeholders exactly once, preserving literal replacement text.
CREATE FUNCTION pg_temp.resolve_variant_text(template TEXT, vals JSONB) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE remaining TEXT := template; result TEXT := ''; token TEXT[]; pos INTEGER;
BEGIN
  FOR token IN SELECT regexp_matches(template, '(\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\})', 'g') LOOP
    pos := strpos(remaining, token[1]);
    result := result || substr(remaining, 1, pos - 1) || coalesce(vals->>token[2], token[1]);
    remaining := substr(remaining, pos + length(token[1]));
  END LOOP;
  RETURN result || remaining;
END $$;

UPDATE "QuizQuestionVariant" v SET answer = v.answer || jsonb_build_object('choices',
  (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.item->>'id', 'content', pg_temp.resolve_variant_text(c.item->>'content', v.values)) ORDER BY c.position), '[]'::jsonb)
   FROM jsonb_array_elements(q.options->'choices') WITH ORDINALITY c(item, position)))
FROM "QuizQuestion" q WHERE q.id = v."quizQuestionId" AND q.options->>'type' = 'variantMultipleChoice' AND q.options->>'version' = '1';

-- Retain the old template only for recognizing existing attempt content hashes.
-- Authoring reads row-owned choices; a subsequent content edit drops this metadata.
UPDATE "QuizQuestion" SET options = (options - 'choices') || jsonb_build_object('version', 2, 'legacyChoices', options->'choices')
WHERE options->>'type' = 'variantMultipleChoice' AND options->>'version' = '1';
COMMIT;

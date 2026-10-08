require('dotenv').config();

const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;
const FORM_URL = (process.env.FEEDBACK_FORM_URL || '').trim();

// ============================================================
// CLÉS API
// Ordre de priorité :
// 1. Google Gemini
// 2. Groq
// 3. OpenRouter
// ============================================================

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();

// ============================================================
// MODÈLES
// Tu peux les modifier directement dans le .env
// ============================================================

const GEMINI_MODEL = (
  process.env.GEMINI_MODEL || 'gemini-3.6-flash'
).trim();

const GROQ_MODEL = (
  process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
).trim();

const OPENROUTER_MODEL = (
  process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b'
).trim();

// ============================================================
// FOURNISSEURS IA
// ============================================================

const AI_PROVIDERS = [
  {
    name: 'Google',
    key: GEMINI_API_KEY,
    model: GEMINI_MODEL
  },
  {
    name: 'Groq',
    key: GROQ_API_KEY,
    model: GROQ_MODEL
  },
  {
    name: 'OpenRouter',
    key: OPENROUTER_API_KEY,
    model: OPENROUTER_MODEL
  }
];

// ============================================================
// PROMPT PRINCIPAL
// ============================================================

const SYSTEM_PROMPT = `Tu es « Assistant Cuisine », un assistant culinaire spécialisé. Tu aides à trouver, préparer et adapter des recettes.

RÈGLES GÉNÉRALES

- Tu réponds toujours en français, en tutoyant l'utilisateur, avec un ton chaleureux et simple.
- Tu ne parles QUE de cuisine (recettes, ingrédients, substitutions, quantités, budget repas, planning de repas, conservation, techniques).
- Si la demande n'a rien à voir avec la cuisine, réponds avec type "chat" en expliquant gentiment que tu ne peux aider que pour la cuisine, et propose une idée de recette.
- Tu connais bien la cuisine africaine et en particulier béninoise (amiwo, pâte rouge, akassa, sauce gombo, sauce feuille, wassa-wassa, atassi, igname pilée, riz au gras, poulet bicyclette, etc.).
- Adapte-toi à des ingrédients faciles à trouver au marché en Afrique de l'Ouest.
- Les prix sont en FCFA et ne sont que des estimations indicatives.
- Les quantités concernent le nombre de personnes indiqué dans "personnes".

FORMAT DE SORTIE

Tu réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour, aucune balise markdown).

Le champ "type" vaut l'une de ces valeurs :

1) "chat" :

{
  "type": "chat",
  "message": "..."
}

2) "recipe" :

{
  "type": "recipe",
  "message": "phrase courte d'introduction ou explication de ce qui a changé",
  "recipe": {
    "nom": "...",
    "personnes": 4,
    "temps_preparation_min": 15,
    "temps_cuisson_min": 30,
    "difficulte": "facile|moyen|difficile",
    "cout_total_fcfa": 2500,
    "ingredients": [
      {
        "nom": "riz",
        "quantite": 400,
        "unite": "g",
        "condiment": false,
        "disponible": null,
        "cout_fcfa": 300
      }
    ],
    "materiel": [
      "casserole",
      "planche à découper"
    ],
    "etapes": [
      {
        "texte": "Coupe les oignons en petits morceaux.",
        "minuteur_secondes": null,
        "minuteur_label": null
      }
    ],
    "conseils": [
      "..."
    ]
  }
}

- "quantite" est un nombre ou null si "au goût".
- "unite" est une chaîne : "g", "kg", "ml", "cl", "L", "c. à soupe", "c. à café", "pincée", "" pour des éléments comptés.
- "condiment" vaut true pour sel, poivre, épices, bouillon, piment, ail, gingembre, herbes, etc.
- "disponible" vaut true si l'utilisateur a dit posséder l'ingrédient, false si non, null s'il n'a rien précisé.
- Chaque étape = une seule action claire, phrase courte à l'impératif, 5 à 12 étapes.
- Si une étape implique un temps précis de cuisson ou d'attente, renseigne "minuteur_secondes" en secondes et "minuteur_label".
- Pour une fourchette, prends la valeur habituelle.
- Si deux cuissons se font en parallèle, mets-les dans deux étapes consécutives distinctes, chacune avec son minuteur.
- Pour toute modification demandée (moins cher, plus épicé, sans piment, autre ingrédient, autre nombre de personnes, plus rapide...), renvoie la recette COMPLÈTE mise à jour, jamais seulement la différence.

3) "suggestions" :

{
  "type": "suggestions",
  "message": "phrase courte",
  "suggestions": [
    {
      "nom": "...",
      "resume": "une phrase",
      "personnes": 4,
      "difficulte": "facile",
      "temps_minutes": 20,
      "disponibles": ["..."],
      "manquants": ["..."],
      "remplacables": [
        {
          "manquant": "beurre",
          "remplacement": "huile"
        }
      ],
      "cout_total_fcfa": 1800
    }
  ]
}

- Donne 3 à 5 propositions réalistes.
- Renseigne "disponibles", "manquants" et "remplacables" quand l'utilisateur a listé ses ingrédients.
- Sinon laisse des listes vides.

4) "plan" :

{
  "type": "plan",
  "message": "phrase courte",
  "plan": {
    "personnes": 2,
    "jours": [
      {
        "jour": "Lundi",
        "petit_dejeuner": null,
        "dejeuner": "Riz au poulet",
        "diner": "Omelette"
      }
    ]
  }
}

- N'inclus que les jours et repas demandés.
- Mets null pour un repas non demandé.
- Varie les plats et respecte le budget et les préférences.

5) "courses" :

{
  "type": "courses",
  "message": "phrase courte",
  "courses": [
    {
      "nom": "riz",
      "quantite": 2,
      "unite": "kg"
    }
  ]
}

- Liste globale regroupée.
- Additionne les quantités d'un même ingrédient pour tout un programme de repas.

CONTRAINTES SPÉCIALES

- Petit budget : respecte le budget autant que possible.
- Renseigne "cout_fcfa" par ingrédient et "cout_total_fcfa".
- Si c'est irréaliste, dis-le honnêtement dans "message" et propose l'option la plus proche.
- Mode rapide : le temps total (préparation + cuisson) ne doit pas dépasser le temps indiqué.
- Si on te donne une "[Recette actuelle]", c'est celle sur laquelle porte la conversation.`;


// ============================================================
// EXPRESS
// ============================================================

const app = express();

app.use(express.json({ limit: '200kb' }));

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);


// ============================================================
// RATE LIMIT
// Maximum 20 requêtes IA par minute / IP
// ============================================================

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();

  const h = hits.get(ip);

  if (!h || now > h.reset) {
    hits.set(ip, {
      count: 1,
      reset: now + 60000
    });

    return false;
  }

  h.count += 1;

  return h.count > 20;
}


// ============================================================
// CONFIG
// ============================================================

app.get('/api/config', (req, res) => {
  res.json({
    formUrl: /^https?:\/\//i.test(FORM_URL)
      ? FORM_URL
      : ''
  });
});


// ============================================================
// CONSTRUCTION DE LA CONVERSATION
// ============================================================

function buildContents(history, message, recipe) {

  const turns = [];

  const push = (role, text) => {

    const last = turns[turns.length - 1];

    if (last && last.role === role) {

      last.parts[0].text += '\n\n' + text;

    } else {

      turns.push({
        role,
        parts: [
          {
            text
          }
        ]
      });

    }
  };


  (Array.isArray(history) ? history : [])
    .slice(-12)
    .forEach(h => {

      if (
        !h ||
        typeof h.text !== 'string' ||
        !h.text.trim()
      ) {
        return;
      }

      const role =
        h.role === 'assistant'
          ? 'model'
          : 'user';

      if (!turns.length && role === 'model') {
        return;
      }

      push(
        role,
        h.text.slice(0, 1500)
      );

    });


  let finalText = String(message)
    .slice(0, 3000);


  if (
    recipe &&
    typeof recipe === 'object'
  ) {

    const json =
      JSON.stringify(recipe);

    if (json.length <= 12000) {

      finalText +=
        '\n\n[Recette actuelle]\n' +
        json;

    }

  }


  push(
    'user',
    finalText
  );


  return turns;
}


// ============================================================
// PARSE JSON
// ============================================================

function parseJson(text) {

  let t = String(text || '')
    .trim()
    .replace(
      /^```(?:json)?\s*/i,
      ''
    )
    .replace(
      /```\s*$/,
      ''
    )
    .trim();


  try {

    return JSON.parse(t);

  } catch (e) {
    // On continue avec extraction
  }


  const a = t.indexOf('{');

  const b = t.lastIndexOf('}');


  if (a !== -1 && b > a) {

    try {

      return JSON.parse(
        t.slice(a, b + 1)
      );

    } catch (e) {
      // JSON invalide
    }

  }


  return null;
}


// ============================================================
// FETCH AVEC TIMEOUT
// ============================================================

async function fetchWithTimeout(
  url,
  options,
  timeoutMs = 90000
) {

  const ctrl =
    new AbortController();

  const timer =
    setTimeout(
      () => ctrl.abort(),
      timeoutMs
    );


  try {

    return await fetch(
      url,
      {
        ...options,
        signal: ctrl.signal
      }
    );

  } finally {

    clearTimeout(timer);

  }
}


// ============================================================
// APPEL GEMINI
// ============================================================

async function callGemini(
  provider,
  contents
) {

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`;


  const response =
    await fetchWithTimeout(
      url,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          'x-goog-api-key':
            provider.key
        },

        body: JSON.stringify({

          systemInstruction: {
            parts: [
              {
                text: SYSTEM_PROMPT
              }
            ]
          },

          contents,

          generationConfig: {
            responseMimeType:
              'application/json'
          }

        })
      }
    );


  const data =
    await response
      .json()
      .catch(() => ({}));


  return {
    status: response.status,
    data
  };
}


// ============================================================
// APPEL API COMPATIBLE OPENAI
// Utilisé par Groq et OpenRouter
// ============================================================

async function callOpenAICompatible(
  provider,
  url,
  contents,
  extraHeaders = {}
) {

  const messages = [

    {
      role: 'system',
      content: SYSTEM_PROMPT
    },

    ...contents.map(turn => ({

      role:
        turn.role === 'model'
          ? 'assistant'
          : 'user',

      content:
        (turn.parts || [])
          .map(
            part => part.text || ''
          )
          .join('')

    }))

  ];


  const headers = {

    'Content-Type':
      'application/json',

    'Authorization':
      `Bearer ${provider.key}`,

    ...extraHeaders

  };


  const response =
    await fetchWithTimeout(
      url,
      {
        method: 'POST',

        headers,

        body: JSON.stringify({

          model:
            provider.model,

          messages,

          temperature: 0.4,

          response_format: {
            type: 'json_object'
          }

        })
      }
    );


  const data =
    await response
      .json()
      .catch(() => ({}));


  return {
    status: response.status,
    data
  };
}


// ============================================================
// APPEL GROQ
// ============================================================

async function callGroq(
  provider,
  contents
) {

  return callOpenAICompatible(

    provider,

    'https://api.groq.com/openai/v1/chat/completions',

    contents

  );
}


// ============================================================
// APPEL OPENROUTER
// ============================================================

async function callOpenRouter(
  provider,
  contents
) {

  return callOpenAICompatible(

    provider,

    'https://openrouter.ai/api/v1/chat/completions',

    contents,

    {

      'HTTP-Referer':
        process.env.OPENROUTER_SITE_URL ||
        'http://localhost:3000',

      'X-Title':
        process.env.OPENROUTER_APP_NAME ||
        'Assistant Cuisine'

    }

  );
}


// ============================================================
// CHOIX DU FOURNISSEUR
// ============================================================

async function callProvider(
  provider,
  contents
) {

  if (provider.name === 'Google') {

    return callGemini(
      provider,
      contents
    );

  }


  if (provider.name === 'Groq') {

    return callGroq(
      provider,
      contents
    );

  }


  if (provider.name === 'OpenRouter') {

    return callOpenRouter(
      provider,
      contents
    );

  }


  throw new Error(
    `Fournisseur inconnu : ${provider.name}`
  );
}


// ============================================================
// VÉRIFIER SI UNE API EST CONFIGURÉE
// ============================================================

function isConfigured(provider) {

  return Boolean(

    provider.key &&

    !provider.key.startsWith('COLLE_')

  );

}


// ============================================================
// EXTRAIRE LA RÉPONSE
// ============================================================

function extractProviderText(
  provider,
  data
) {

  // Gemini
  if (provider.name === 'Google') {

    const parts =
      (((data.candidates || [])[0] || {})
        .content || {})
        .parts;


    return Array.isArray(parts)
      ? parts
          .map(p => p.text || '')
          .join('')
      : '';

  }


  // Groq / OpenRouter
  return (

    (((data.choices || [])[0] || {})
      .message || {})
      .content || ''

  );
}


// ============================================================
// MESSAGE D'ERREUR
// ============================================================

function providerErrorMessage(
  provider,
  status,
  data
) {

  const msg =
    (
      data &&
      data.error &&
      (
        data.error.message ||
        data.error.code
      )
    ) || '';


  if (
    status === 401 ||
    status === 403
  ) {

    return `${provider.name}: clé API refusée ou non autorisée.`;

  }


  if (status === 404) {

    return `${provider.name}: modèle introuvable (${provider.model}).`;

  }


  if (status === 429) {

    return `${provider.name}: limite de requêtes atteinte.`;

  }


  if (status >= 500) {

    return `${provider.name}: service temporairement indisponible.`;

  }


  return (
    `${provider.name}: erreur ${status}` +
    (
      msg
        ? ` - ${msg}`
        : ''
    )
  );
}


// ============================================================
// ROUTE PRINCIPALE IA
// ============================================================

app.post(
  '/api/ai',
  async (req, res) => {

    // --------------------------------------------------------
    // Vérifier qu'au moins une API est disponible
    // --------------------------------------------------------

    if (
      !AI_PROVIDERS.some(
        isConfigured
      )
    ) {

      return res
        .status(503)
        .json({

          error:
            "Aucune clé API IA n'est configurée. Renseigne GEMINI_API_KEY, GROQ_API_KEY ou OPENROUTER_API_KEY dans .env."

        });

    }


    // --------------------------------------------------------
    // Rate limit
    // --------------------------------------------------------

    if (
      rateLimited(req.ip)
    ) {

      return res
        .status(429)
        .json({

          error:
            "Trop de demandes en peu de temps. Attends une minute puis réessaie."

        });

    }


    // --------------------------------------------------------
    // Récupérer les données
    // --------------------------------------------------------

    const {
      message,
      history,
      recipe
    } = req.body || {};


    if (
      typeof message !== 'string' ||
      !message.trim()
    ) {

      return res
        .status(400)
        .json({

          error:
            'Message vide.'

        });

    }


    // --------------------------------------------------------
    // Construire la conversation
    // --------------------------------------------------------

    const contents =
      buildContents(
        history,
        message,
        recipe
      );


    try {

      let result = null;

      let lastError = '';

      let attempted = 0;


      // ======================================================
      // FALLBACK AUTOMATIQUE
      //
      // GOOGLE
      //   ↓
      // GROQ
      //   ↓
      // OPENROUTER
      // ======================================================

      for (
        const provider
        of AI_PROVIDERS
      ) {

        // API non configurée
        if (
          !isConfigured(provider)
        ) {

          continue;

        }


        attempted++;


        // ----------------------------------------------------
        // Deux tentatives maximum pour chaque fournisseur
        // ----------------------------------------------------

        for (
          let attempt = 0;
          attempt < 2;
          attempt++
        ) {

          try {

            const {
              status,
              data
            } =
              await callProvider(
                provider,
                contents
              );


            // =================================================
            // SUCCÈS
            // =================================================

            if (status === 200) {

              const joined =
                extractProviderText(
                  provider,
                  data
                );


              const parsed =
                parseJson(joined);


              if (
                parsed &&
                typeof parsed === 'object' &&
                parsed.type
              ) {

                result = parsed;


                console.log(
                  `IA utilisée : ${provider.name} (${provider.model})`
                );


                break;

              }


              // Réponse vide / JSON invalide
              if (
                !joined &&
                data.promptFeedback &&
                data.promptFeedback.blockReason
              ) {

                return res
                  .status(422)
                  .json({

                    error:
                      "Cette demande n'a pas pu être traitée. Reformule-la."

                  });

              }


              lastError =
                `${provider.name}: réponse JSON invalide.`;

              break;

            }


            // =================================================
            // ERREUR
            // =================================================

            lastError =
              providerErrorMessage(
                provider,
                status,
                data
              );


            // -------------------------------------------------
            // 429 = limite atteinte
            // 500+ = serveur indisponible
            // On retente une fois.
            // Ensuite on passe au fournisseur suivant.
            // -------------------------------------------------

            if (
              status === 429 ||
              status >= 500
            ) {

              if (
                attempt === 0
              ) {

                await new Promise(
                  resolve =>
                    setTimeout(
                      resolve,
                      1000
                    )
                );

                continue;

              }

              break;

            }


            // -------------------------------------------------
            // 401 / 403 / 404 / autres
            // Pas besoin de retenter.
            // On passe directement au suivant.
            // -------------------------------------------------

            break;

          } catch (err) {

            lastError =
              `${provider.name}: ${
                err &&
                err.name === 'AbortError'
                  ? 'timeout'
                  : 'connexion impossible'
              }`;


            // Retente une fois
            if (
              attempt === 0
            ) {

              await new Promise(
                resolve =>
                  setTimeout(
                    resolve,
                    700
                  )
              );

              continue;

            }

            break;

          }

        }


        // ----------------------------------------------------
        // Si une API a répondu correctement, on arrête.
        // ----------------------------------------------------

        if (result) {

          break;

        }


        console.warn(
          `Fallback IA : ${lastError}`
        );

      }


      // ======================================================
      // AUCUNE API CONFIGURÉE
      // ======================================================

      if (
        !result &&
        attempted === 0
      ) {

        return res
          .status(503)
          .json({

            error:
              "Aucune clé API IA valide n'est configurée dans .env."

          });

      }


      // ======================================================
      // LES 3 API ONT ÉCHOUÉ
      // ======================================================

      if (!result) {

        console.error(
          `Tous les fournisseurs IA ont échoué. Dernière erreur : ${lastError}`
        );


        return res
          .status(503)
          .json({

            error:
              "Les 3 services IA sont temporairement indisponibles. Réessaie dans quelques secondes."

          });

      }


      // ======================================================
      // ENVOYER LA RÉPONSE AU FRONTEND
      // ======================================================

      res.json(result);


    } catch (err) {

      const timeout =
        err &&
        err.name === 'AbortError';


      res
        .status(504)
        .json({

          error:
            timeout
              ? "L'IA met trop de temps à répondre. Réessaie."
              : "Impossible de joindre les services IA. Vérifie ta connexion."

        });

    }

  }
);


// ============================================================
// DÉMARRAGE DU SERVEUR
// ============================================================

app.listen(
  PORT,
  () => {

    console.log(
      `Assistant Cuisine prêt : http://localhost:${PORT}`
    );


    const actifs =
      AI_PROVIDERS
        .filter(isConfigured)
        .map(
          p =>
            `${p.name} (${p.model})`
        );


    console.log(
      `Fournisseurs IA configurés : ${
        actifs.length
          ? actifs.join(' -> ')
          : 'aucun'
      }`
    );


    if (!actifs.length) {

      console.log(
        '⚠ Renseigne au moins une clé : GEMINI_API_KEY, GROQ_API_KEY ou OPENROUTER_API_KEY'
      );

    }

  }
);
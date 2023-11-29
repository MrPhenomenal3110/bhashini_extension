const htmlStringToDOM = (html) => {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html").body;
};
const IGNORE_NODES = ["SCRIPT", "STYLE"];

const mapNodesAndText = (element, map) => {
  if (
    element &&
    element.nodeType === 3 &&
    element.textContent.trim().replaceAll("\n", "")
  ) {
    let text = element.textContent.trim();
    if (map.has(text)) {
      map.get(text).push(element);
    } else {
      map.set(text, [element]);
    }
  } else if (
    element &&
    element.nodeType === 1 &&
    !IGNORE_NODES.includes(element.nodeName)
  ) {
    element.childNodes.forEach((child) => {
      mapNodesAndText(child, map);
    });
  }
};

// import BhashiniTranslator from './utils/translate';
class BhashiniTranslator {
  #pipelineData1;
  #pipelineData2;
  #apiKey1;
  #apiKey2;
  #userID;
  #sourceLanguage;
  #targetLanguage;
  failcount = 0;
  constructor(apiKey1, apiKey2, userID) {
    if (!apiKey1  || !apiKey2 || !userID) {
      throw new Error("Invalid credentials");
    }
    this.#apiKey1 = apiKey1;
    this.#apiKey2 = apiKey2;
    this.#userID = userID;
  }

  async #getPipeline1(sourceLanguage, targetLanguage) {
    this.#sourceLanguage = sourceLanguage;
    this.#targetLanguage = targetLanguage;
    const apiUrl =
      "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        ulcaApiKey: this.#apiKey1,
        userID: this.#userID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pipelineTasks: [
          {
            taskType: "translation",
            config: {
              language: {
                sourceLanguage,
                targetLanguage,
              },
            },
          },
        ],
        pipelineRequestConfig: {
          pipelineId: "64392f96daac500b55c543cd",
        },
      }),
    });

    const data = await response.json();
    this.#pipelineData1 = data;
  }
  async #getPipeline2(sourceLanguage, targetLanguage) {
    this.#sourceLanguage = sourceLanguage;
    this.#targetLanguage = targetLanguage;
    const apiUrl =
      "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        ulcaApiKey: this.#apiKey2,
        userID: this.#userID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pipelineTasks: [
          {
            taskType: "translation",
            config: {
              language: {
                sourceLanguage,
                targetLanguage,
              },
            },
          },
        ],
        pipelineRequestConfig: {
          pipelineId: "643930aa521a4b1ba0f4c41d",
        },
      }),
    });

    const data = await response.json();
    this.#pipelineData2 = data;
  }

  async #translate1(content, sourceLanguage, targetLanguage) {
    if (!this.#pipelineData1) {
      throw new Error("pipelineData not found");
    }
    const callbackURL =
      this.#pipelineData1.pipelineInferenceAPIEndPoint.callbackUrl;
    const inferenceApiKey =
      this.#pipelineData1.pipelineInferenceAPIEndPoint.inferenceApiKey.value;
    const serviceId =
      this.#pipelineData1.pipelineResponseConfig[0].config.serviceId;
    let resp;
    try {
      resp = await fetch(callbackURL, {
        method: "POST",
        headers: {
          Authorization: inferenceApiKey,
          "Content-type": "application/json",
        },
        body: JSON.stringify({
          pipelineTasks: [
            {
              taskType: "translation",
              config: {
                language: {
                  sourceLanguage,
                  targetLanguage,
                },
                serviceId,
              },
            },
          ],
          inputData: {
            input: [
              {
                source: content,
              },
            ],
          },
        }),
      }).then((res) => res.json());
    } catch (e) {
      if (this.failcount > 10)
        throw new Error(
          "Failed getting a response from the server after 10 tries"
        );
      this.failcount++;
      this.#getPipeline1(sourceLanguage, targetLanguage);
      resp = await this.#translate1(content, sourceLanguage, targetLanguage);
    }
    this.failcount = 0;
    return resp.pipelineResponse[0].output[0].target;
  }
  async #translate2(content, sourceLanguage, targetLanguage) {
    if (!this.#pipelineData2) {
      throw new Error("pipelineData not found");
    }
    const callbackURL =
      this.#pipelineData2.pipelineInferenceAPIEndPoint.callbackUrl;
    const inferenceApiKey =
      this.#pipelineData2.pipelineInferenceAPIEndPoint.inferenceApiKey.value;
    const serviceId =
      this.#pipelineData2.pipelineResponseConfig[0].config.serviceId;
    let resp;
    try {
      resp = await fetch(callbackURL, {
        method: "POST",
        headers: {
          Authorization: inferenceApiKey,
          "Content-type": "application/json",
        },
        body: JSON.stringify({
          pipelineTasks: [
            {
              taskType: "translation",
              config: {
                language: {
                  sourceLanguage,
                  targetLanguage,
                },
                serviceId,
              },
            },
          ],
          inputData: {
            input: [
              {
                source: content,
              },
            ],
          },
        }),
      }).then((res) => res.json());
    } catch (e) {
      if (this.failcount > 10)
        throw new Error(
          "Failed getting a response from the server after 10 tries"
        );
      this.failcount++;
      this.#getPipeline2(sourceLanguage, targetLanguage);
      resp = await this.#translate2(content, sourceLanguage, targetLanguage);
    }
    this.failcount = 0;
    return resp.pipelineResponse[0].output[0].target;
  }
    ///
  async translateDOM(dom, sourceLanguage, targetLanguage) {
    if (
      !this.#pipelineData1 || !this.#pipelineData2 ||
      this.#sourceLanguage !== sourceLanguage ||
      this.#targetLanguage !== targetLanguage
    ) {
      await this.#getPipeline1(sourceLanguage, targetLanguage);
      await this.#getPipeline2(sourceLanguage, targetLanguage);
    }
  
    const map = new Map();
    mapNodesAndText(dom, map);
  
    const batchedTexts = Array.from(map.keys());
  
    // Split the array into batches (e.g., batches of 10)
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < batchedTexts.length; i += batchSize) {
      batches.push(batchedTexts.slice(i, i + batchSize));
    }
  
    const promises = batches.map(async (batch, index) => {
      // Combine texts in the batch
      const combinedText = batch.join(" ");
  
      // Use translate1 for odd-indexed batches and translate2 for even-indexed batches
      const translated =
        index % 2 === 0
          ? await this.#translate1(combinedText, sourceLanguage, targetLanguage)
          : await this.#translate2(combinedText, sourceLanguage, targetLanguage);
  
      // Update each node in the batch with its corresponding translated text
      batch.forEach((text) => {
        map.get(text).forEach((node) => {
          if (node.textContent.trim() === text.trim()) {
            // Check if the node's content matches the original text
            node.textContent = translated;
          }
        });
      });
    });
  
    await Promise.all(promises);
  
    return dom;
  }
    ///

  async translateHTMLstring(html, sourceLanguage, targetLanguage) {
    const dom = htmlStringToDOM(html);
    const translated = await this.translateDOM(
      dom,
      sourceLanguage,
      targetLanguage
    );
    return translated;
  }
}

// calling the library here
// need to send data from the popup here to and then call the api
// only trigger a this function if a reviece a message from the popup

const Bhashini = new BhashiniTranslator(
  "019a562b7f-bb9c-4440-8b79-11b170353130",
  "24b1feccfb-e99c-4bd0-81e3-d7b875eea16e",
  "48115d2ab7f24c55b8b29af34806050c"
);

chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  if (request.action === "translateContent") {
    const response = await Bhashini.translateDOM(
      document.body,
      request.sourceLanguage,
      request.targetLanguage
    );

    console.log("response", response);
  }
});

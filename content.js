const htmlStringToDOM = (html) => {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html").body;
};
const IGNORE_NODES = ["SCRIPT", "STYLE","IMG"];

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
  #pipelineData;
  #apiKey;
  #userID;
  #sourceLanguage;
  #targetLanguage;
  time = {
    "pipelineCalls": [],
    "translate": [],
    "mapping": [],
    "DOMupdation": [],
    "totalTimeTaken": [],
  };
  failcount = 0;
  constructor(apiKey, userID) {
    if (!apiKey || !userID) {
      throw new Error("Invalid credentials");
    }
    this.#apiKey = apiKey;
    this.#userID = userID;
  }

  async #getPipeline(sourceLanguage, targetLanguage) {
    this.#sourceLanguage = sourceLanguage;
    this.#targetLanguage = targetLanguage;
    const apiUrl =
      "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";

    const pipelineStart = performance.now();
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        ulcaApiKey: this.#apiKey,
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
    this.#pipelineData = data;
    const pipelineEnd = performance.now();
    const pipelineTime = pipelineEnd - pipelineStart;
    this.time.pipelineCalls.push(pipelineTime);
  }

  async translateHTMLstring(html, sourceLanguage, targetLanguage) {
    const dom = htmlStringToDOM(html);
    const translated = await this.translateDOM(
      dom,
      sourceLanguage,
      targetLanguage
    );
    return translated;
  }


  async #translate(contents, sourceLanguage, targetLanguage) {
    if (!this.#pipelineData) {
      throw new Error("pipelineData not found");
    }
    const callbackURL =
      this.#pipelineData.pipelineInferenceAPIEndPoint.callbackUrl;
    const inferenceApiKey =
      this.#pipelineData.pipelineInferenceAPIEndPoint.inferenceApiKey.value;
    const serviceId =
      this.#pipelineData.pipelineResponseConfig[0].config.serviceId;
    let resp;


    try {
      // making an input array
      const inputArray = contents.map((content) => ({
        source: content,
      }));

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
            input: inputArray,
          },
        }),
      }).then((res) => res.json());
    } catch (e) {
      if (this.failcount > 10)
        throw new Error(
          "Failed getting a response from the server after 10 tries"
        );
      this.failcount++;
      this.#getPipeline(sourceLanguage, targetLanguage);
      resp = await this.#translate(contents, sourceLanguage, targetLanguage);
    }
    this.failcount = 0;
    return resp.pipelineResponse[0].output;
  }


  // the translate dom function 


  async translateDOM(dom, sourceLanguage, targetLanguage) {
    if (
      !this.#pipelineData ||
      this.#sourceLanguage !== sourceLanguage ||
      this.#targetLanguage !== targetLanguage
    ) {
      await this.#getPipeline(sourceLanguage, targetLanguage);
    }

    const map = new Map();

    const mappingStart = performance.now();

    mapNodesAndText(dom, map);

    const mappingEnd = performance.now();

    const mappingTime = mappingEnd - mappingStart;

    this.time.mapping.push(mappingTime);

    const batchedTexts = Array.from(map.keys());

    // Split the array into batches (e.g., batches of 10)
    const batchSize = 20;
    const batches = [];
    for (let i = 0; i < batchedTexts.length; i += batchSize) {
      batches.push(batchedTexts.slice(i, i + batchSize));
    }
    // console.log(batches);

    const promises = batches.map(async (batch) => {
      // Combine texts in the batch
      const combinedText = batch;
      const translationStart = performance.now();

      const translated = await this.#translate(
        combinedText,
        this.#sourceLanguage,
        this.#targetLanguage
      );

      const translationEnd = performance.now();

      const translationTime = translationEnd - translationStart;
      this.time.translate.push(translationTime);

      // Update each node in the batch with its corresponding translated text

      batch.forEach((text, index) => {
        map.get(text).forEach((node) => {
          const DOMupdationStart = performance.now();
          if (node.textContent.trim() === text.trim()) {
            // Check if the node's content matches the original text
            node.textContent = " "+translated[index].target+" ";
          }
          const DOMupdationEnd = performance.now();
          const DOMupdationTime = DOMupdationEnd - DOMupdationStart;
          this.time.DOMupdation.push(DOMupdationTime);
        });
      });

    });

    const totalStart = performance.now();
    await Promise.all(promises);
    const totalEnd = performance.now();

    const total = totalEnd - totalStart;
    this.time.totalTimeTaken.push(total);

    const translation = this.time.translate.length;

    const translateTimeArray = this.time.translate;
    for(let i = translateTimeArray.length-1; i >= 1; i--){
      translateTimeArray[i] = translateTimeArray[i] - translateTimeArray[i-1];
    }
    const pipelineTIme = this.time.pipelineCalls[0];
    const domTask = this.time.DOMupdation[0];
    const mapping = this.time.mapping[0];
    translateTimeArray.push((-1)*pipelineTIme);
    translateTimeArray.push((-1)*domTask);
    translateTimeArray.push((-1)*mapping);
    this.time.translate = translateTimeArray;

    const totalTime = Object.keys(this.time).reduce((acc, key) => {
      const sum = this.time[key].reduce((total, value) => total + value, 0);
      acc[key] = sum;
      return acc;
    }, {});

    // Map the sums with their respective call headers
    var result = Object.keys(totalTime).map(key => ({
      callHeader: key,
      totalTime: totalTime[key]
    }));  
    console.log(translation);
    console.log(result);
    console.log(this.time);
    var translateTime;
    const translationArray = this.time.translate;

    translationArray.forEach((element) => {
      translateTime = translateTime + element;
    })
    return dom;
  }
}

// calling the library here
// need to send data from the popup here to and then call the api
// only trigger a this function if a reviece a message from the popup

const Bhashini = new BhashiniTranslator(
  "019a562b7f-bb9c-4440-8b79-11b170353130",
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
    // console.log("response", response);
  }
});

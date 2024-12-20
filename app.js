const readline = require("readline");
const { AzureOpenAI } = require("openai");
require("dotenv").config();

// Check environment variables
if (!process.env.AZURE_OPENAI_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
  console.error("Error: Missing Azure OpenAI environment variables.");
  process.exit(1);
}

// Azure OpenAI client setup
const azureOpenAIClient = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  deployment: "gpt-4o-mini",
  apiVersion: "2024-02-15-preview",
});

const conversationHistory = [
  {
    role: "system",
    content:
      "You are a home assistant that can control lights at home. The available lights are Bathroom light, Bedroom light, and Kitchen light.",
  },
];

// Room lights state
const roomLights = [
  { room: "Bathroom", status: false },
  { room: "Kitchen", status: false },
  { room: "Bedroom", status: false },
];

// Function for toggling light switches
const toggleLightSwitch = {
  name: "toggle_light_switch",
  description:
    "Toggle the light switch of a room in the house. Options: Bathroom, Bedroom, Kitchen.",
  parameters: {
    type: "object",
    properties: {
      room: {
        type: "string",
        description: "The room of the light (e.g., 'Bathroom')",
        enum: ["Bathroom", "Kitchen", "Bedroom"],
      },
      isSwitchOn: {
        type: "boolean",
        description:
          "True if the light should be switched on, otherwise False.",
      },
    },
    required: ["room", "isSwitchOn"],
  },
};

// Change light switch status
function changeLightSwitch(room, status) {
  const roomLight = roomLights.find((r) => r.room === room);

  if (!roomLight) {
    return `Unable to find the room: ${room}`;
  }

  if (roomLight.status === status) {
    return `${room} light is already ${status ? "on" : "off"}.`;
  }

  roomLight.status = status;
  return `${room} light is now switched ${status ? "on" : "off"}.`;
}

// Get user input
async function getUserInput(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Process chat response
async function processChatResponse(response) {
  for (const choice of response.choices) {
    conversationHistory.push(choice.message);
    if (choice.message.tool_calls) {
      const toolCall = choice.message.tool_calls[0];
      if (toolCall.function.name === "toggle_light_switch") {
        const { room, isSwitchOn } = JSON.parse(toolCall.function.arguments);
        const functionResponse = changeLightSwitch(room, isSwitchOn);

        conversationHistory.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolCall.function.name,
          content: functionResponse,
        });

        //Make a follow-up API call to OpenAI
        const followUpResponse =
          await azureOpenAIClient.chat.completions.create({
            messages: conversationHistory,
          });
        console.log("Assistant:", followUpResponse.choices[0].message.content);
      }
    } else {
      conversationHistory.push(choice.message);

      console.log("Assistant:", choice.message.content);
    }
  }
}

//Main loop
async function main() {
  console.log("Program started. Type 'x' to exit.");

  while (true) {
    try {
      const userInput = await getUserInput("User: ");
      if (userInput.toLowerCase() === "x") {
        console.log("Exiting program. Goodbye!");
        break;
      }

      conversationHistory.push({ role: "user", content: userInput });

      const chatResponse = await azureOpenAIClient.chat.completions.create({
        messages: conversationHistory,
        tools: [{ type: "function", function: toggleLightSwitch }],
      });

      await processChatResponse(chatResponse);
    } catch (error) {
      console.error("An error occurred:", error.message || error);
    }
  }
}

main();

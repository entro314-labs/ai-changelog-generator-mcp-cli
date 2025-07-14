/**
 * Abstract Base Provider for AI models.
 * Defines the interface that all provider plugins must implement.
 */
class BaseProvider {
  constructor(config) {
    if (this.constructor === BaseProvider) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.config = config;
  }

  /**
   * Returns the name of the provider.
   * @returns {string} The provider's name (e.g., 'openai', 'azure').
   */
  getName() {
    throw new Error('Method "getName()" must be implemented.');
  }

  /**
   * Checks if the provider is available and configured correctly.
   * @returns {boolean} True if the provider is available, false otherwise.
   */
  isAvailable() {
    throw new Error('Method "isAvailable()" must be implemented.');
  }

  /**
   * Generates a completion from the AI model.
   * @param {Array<object>} messages - The array of messages for the conversation.
   * @param {object} options - Additional options for the completion (e.g., max_tokens).
   * @returns {Promise<object>} The AI's response.
   */
  async generateCompletion(messages, options) {
    throw new Error('Method "generateCompletion()" must be implemented.');
  }

  /**
   * Recommends a model based on the commit details.
   * @param {object} commitDetails - Details about the commit (e.g., files changed, lines changed).
   * @returns {object} The recommended model and reason.
   */
  getModelRecommendation(commitDetails) {
    throw new Error('Method "getModelRecommendation()" must be implemented.');
  }

  /**
   * Validates if a specific model is available for the provider.
   * @param {string} modelName - The name of the model to validate.
   * @returns {Promise<object>} An object indicating availability and capabilities.
   */
  async validateModelAvailability(modelName) {
    throw new Error('Method "validateModelAvailability()" must be implemented.');
  }

  /**
   * Tests the connection to the provider's API.
   * @returns {Promise<object>} An object indicating success or failure.
   */
  async testConnection() {
    throw new Error('Method "testConnection()" must be implemented.');
  }

  /**
   * Gets the capabilities of the provider or a specific model.
   * @param {string} [modelName] - Optional model name to get specific capabilities.
   * @returns {object} An object listing the provider's capabilities.
   */
  getCapabilities(modelName) {
    throw new Error('Method "getCapabilities()" must be implemented.');
  }
}

module.exports = BaseProvider;

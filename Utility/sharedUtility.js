
const retryOperation = async (fn, maxRetries = 3, delay = 1000) =>
{
    let attempts = 0;
    while (attempts < maxRetries)
    {
        try
        {
            return await fn();
        } catch (error)
        {
            attempts++;
            console.warn(`Attempt ${attempts} failed: ${error.message}. Retrying in ${delay}ms...`);
            if (attempts < maxRetries)
            {
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else
            {
                throw error; // Re-throw if max retries reached
            }
        }
    }
}

module.exports = {
    retryOperation
}
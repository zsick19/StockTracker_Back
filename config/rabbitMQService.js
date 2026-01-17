export const sendRabbitMessage = (req, res, queueName, taskData) =>
{
    const channel = req.app.locals.channel
    if (!channel) return res.status(500).send('RabbitMQ channel not available')

    const task = {
        id: Math.floor(Math.random() * 1000),
        data: taskData,
        timestamp: new Date().toISOString()
    }

    const msg = JSON.stringify(task);
    channel.sendToQueue(queueName, Buffer.from(msg), { persistent: true })
    console.log(`Producer sent message:${msg}`)
}
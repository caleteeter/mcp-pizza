import express from 'express';
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import fs from 'fs';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

// create express app
const app = express();
app.use(express.json());

// map to store transports by session id
const transports: {[sessionId: string]: StreamableHTTPServerTransport} = {};

// create mcp server
const server = new McpServer({
    name: 'pizza-server',
    version: '1.0.0',
    capabilities: {
        resources: {},
        tools: {},
    },
});

// helper functions
enum Size {
    SMALL = 'small',
    MEDIUM = 'medium',
    LARGE = 'large',
}

enum Topping {
    PEPPERONI = 'pepperoni',
    MUSHROOMS = 'mushrooms',
    ONIONS = 'onions',
    SAUSAGE = 'sausage',
    BACON = 'bacon',
    EXTRA_CHEESE = 'extra cheese',
    BLACK_OLIVES = 'black olives',
    GREEN_PEPPERS = 'green peppers',
    PINEAPPLE = 'pineapple',
    SPINACH = 'spinach',
}

enum OrderStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',    
}

interface Order {
    orderId: string;
    size: Size;
    toppings: Topping[];
    status: OrderStatus;
}
    
const orderStatus: Record<string, Order> = {};

async function createOrder(size: Size, toppings: Topping[]) {
    const order = { 
        orderId: uuidv4(),
        size,
        toppings,
        status: OrderStatus.PENDING,
    };

    orderStatus[order.orderId] = order;

    return {
        order
    };
}

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
        // Use existing transport
        transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
                transports[sessionId] = transport;
            },
        });

        transport.onclose = () => {
            if (transport.sessionId) {
                delete transports[transport.sessionId];
            }
        };

        const server = new McpServer({
            name: 'pizza-server',
            version: '1.0.0'
        });

        // register resources
        server.resource(
            'pizza-menu',
            'file:///menu.pdf',
            {},
            async (uri: any) => {
                try {
                    // read PDF file
                    const menuPath = join(process.cwd(), 'menu.pdf');
                    const pdfBuffer = await fs.promises.readFile(menuPath);

                    return {
                        contents: [
                            {
                                uri: uri,
                                mimeType: 'application/pdf',
                                blob: pdfBuffer.toString('base64')
                            }
                        ]
                    };
                } catch (error) {
                    console.error("Error reading menu PDF:", error);
                    throw new Error("Failed to read menu PDF");
                }
            }
        );

        // register tools
        server.tool(
            "order-pizza",
            "Order a pizza",
            {
                size: z.nativeEnum(Size),
                toppings: z.array(z.nativeEnum(Topping)).min(1).max(10),
            },
            async ({ size, toppings }) => {
                const order = await createOrder(size, toppings);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Your ${order.order.size} pizza has been ordered with the following toppings: ${order.order.toppings.join(", ")}.  Your order number is ${order.order.orderId}.`,
                        },
                    ],
                };
            }
        );

        server.tool(
            "get-order-status",
            "Get the status of your pizza order",
            {
                orderId: z.string().uuid(),
            },
            async ({ orderId }) => {
                const order = orderStatus[orderId];
                if (!order) {
                    return {
                        content: [
                            {type: 'text',
                            text: `Order with ID ${orderId} not found.`,
                            },
                        ],
                    };
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Order with ID ${orderId} is currently ${order.status}.`,
                        },
                    ],
                };
            }
        );

        server.tool(
            "update-order-status",
            "Update the status of your pizza order",
            {
                orderId: z.string().uuid(),
                status: z.nativeEnum(OrderStatus),
            },
            async ({ orderId, status }) => {
                const order = orderStatus[orderId];
                if (!order) {
                    return {
                        content: [
                            {type: 'text',
                            text: `Order with ID ${orderId} not found.`,
                            },
                        ],
                    };
                }

                order.status = status;

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Order with ID ${orderId} status updated to ${status}.`,
                        },
                    ],
                };
            } 
        );

        // connect to mcp server
        await server.connect(transport);
    } else {
        // Invalid request
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Bad Request: No valid session ID provided',
            },
            id: null,
        });
        return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

app.listen(process.env.PORT || 3000);
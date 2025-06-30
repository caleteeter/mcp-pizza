import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { v4 as uuidv4 } from 'uuid';
import { join } from 'path';
import fs from 'fs';
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
var Size;
(function (Size) {
    Size["SMALL"] = "small";
    Size["MEDIUM"] = "medium";
    Size["LARGE"] = "large";
})(Size || (Size = {}));
var Topping;
(function (Topping) {
    Topping["PEPPERONI"] = "pepperoni";
    Topping["MUSHROOMS"] = "mushrooms";
    Topping["ONIONS"] = "onions";
    Topping["SAUSAGE"] = "sausage";
    Topping["BACON"] = "bacon";
    Topping["EXTRA_CHEESE"] = "extra cheese";
    Topping["BLACK_OLIVES"] = "black olives";
    Topping["GREEN_PEPPERS"] = "green peppers";
    Topping["PINEAPPLE"] = "pineapple";
    Topping["SPINACH"] = "spinach";
})(Topping || (Topping = {}));
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["PENDING"] = "pending";
    OrderStatus["IN_PROGRESS"] = "in_progress";
    OrderStatus["COMPLETED"] = "completed";
    OrderStatus["CANCELLED"] = "cancelled";
})(OrderStatus || (OrderStatus = {}));
const orderStatus = {};
async function createOrder(size, toppings) {
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
// register resources
server.resource('pizza-menu', 'file:///menu.pdf', {}, async (uri) => {
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
    }
    catch (error) {
        console.error("Error reading menu PDF:", error);
        throw new Error("Failed to read menu PDF");
    }
});
// register tools
server.tool("order-pizza", "Order a pizza", {
    size: z.nativeEnum(Size),
    toppings: z.array(z.nativeEnum(Topping)).min(1).max(10),
}, async ({ size, toppings }) => {
    const order = await createOrder(size, toppings);
    return {
        content: [
            {
                type: 'text',
                text: `Your ${order.order.size} pizza has been ordered with the following toppings: ${order.order.toppings.join(", ")}.  Your order number is ${order.order.orderId}.`,
            },
        ],
    };
});
server.tool("get-order-status", "Get the status of your pizza order", {
    orderId: z.string().uuid(),
}, async ({ orderId }) => {
    const order = orderStatus[orderId];
    if (!order) {
        return {
            content: [
                { type: 'text',
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
});
server.tool("update-order-status", "Update the status of your pizza order", {
    orderId: z.string().uuid(),
    status: z.nativeEnum(OrderStatus),
}, async ({ orderId, status }) => {
    const order = orderStatus[orderId];
    if (!order) {
        return {
            content: [
                { type: 'text',
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
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Pizza MCP server running on stdio");
}
main().catch((error) => {
    console.error("Error starting the server:", error);
    process.exit(1);
});

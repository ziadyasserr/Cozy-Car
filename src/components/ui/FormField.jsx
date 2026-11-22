function FormField({ label, children, required }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
                {label}
                {required && <span className="ml-1 text-red-500">*</span>}
            </label>
            {children}
        </div>
    );
}

export default FormField;
